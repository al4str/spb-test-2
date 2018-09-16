require('babel-polyfill');
const d3 = require('d3');

const SYMBOLS = [
  { value: 'aapl', cap: 'Apple' },
  { value: 'googl', cap: 'Google' },
  { value: 'msft', cap: 'Microsoft' },
];
const PERIODS = [
  { title: '1 день', value: '1d', cap: '1Д' },
  { title: '1 месяц', value: '1m', cap: '1М' },
  { title: '3 месяца', value: '3m', cap: '3М' },
  { title: '6 месяцев', value: '6m', cap: '6М' },
  { title: 'От начала года', value: 'ytd', cap: 'YTD' },
  { title: '1 год', value: '1y', cap: '1Г' },
  { title: '5 лет', value: '5y', cap: '5Л' },
];
const TYPES = [
  { value: 'line', cap: 'Линия' },
  { value: 'candle', cap: 'Японские свечи' },
];
const OHLC_LIST = [
  { name: 'open', cap: 'откр', value: '—' },
  { name: 'high', cap: 'макс', value: '—' },
  { name: 'low', cap: 'мин', value: '—' },
  { name: 'close', cap: 'закр', value: '—' },
];

class State {
  static checkName(name, state) {
    if (!name || !state.hasOwnProperty(name)) {
      throw new Error(`Name "${name}" not found`);
    }
    return true;
  }
  static checkValue(value) {
    if (value === undefined) {
      throw new Error(`Value is undefined`);
    }
    return true;
  }
  static checkSubscriber(subscriber) {
    if (typeof subscriber !== 'function') {
      throw new Error(`Subscriber is not a function`);
    }
    return true;
  }
  constructor(initialState = {}) {
    this.state = initialState;
    this.subscribers = {};
    Object.keys(this.state).forEach((name) => {
      this.subscribers[name] = [];
    });
  }
  get(name) {
    State.checkName(name, this.state);
    return this.state[name];
  }
  update(name, value) {
    State.checkName(name, this.state);
    State.checkValue(value);
    const state = {};
    Object.entries(this.state).forEach(([prevStateName, prevStateValue]) => {
      if (prevStateName === name) {
        if (typeof prevStateValue === 'object') {
          state[prevStateName] = JSON.parse(JSON.stringify(value));
        } else {
          state[prevStateName] = value;
        }
      } else {
        state[prevStateName] = prevStateValue;
      }
    });
    this.state = state;
    this.subscribers[name].forEach(subscriber => subscriber(value));
  }
  subscribe(name, subscriber) {
    State.checkName(name, this.state);
    State.checkSubscriber(subscriber);
    this.subscribers[name].push(subscriber);
  }
}

class RadioField {
  constructor(props) {
    const { $parent, name, defaultValue, items, requestStateUpdate } = props;
    this.$parent = $parent;
    this.name = name;
    this.defaultValue = defaultValue;
    this.items = items;
    this.requestStateUpdate = requestStateUpdate;
    this.handleChange = this.handleChange.bind(this);
  }
  disable() {
    this.$list.classed('stock-chart-widget_disabled', true);
    this.$fields.property('disabled', true);
  }
  enable() {
    this.$list.classed('stock-chart-widget_disabled', false);
    this.$fields.property('disabled', false);
  }
  handleChange({ value }) {
    this.requestStateUpdate({ [this.name]: value });
  }
  render() {
    this.$list = this.$parent
      .append('div')
      .attr('class', 'stock-chart-widget__radio-list')
      .attr('role', 'radiogroup');
    const $labels = this.$list
      .selectAll('label')
      .data(this.items)
      .enter()
      .append('label')
      .attr('class', 'stock-chart-widget__radio-item')
      .property('title', ({ title }) => title);
    this.$fields = $labels
      .append('input')
      .attr('class', 'stock-chart-widget__radio-field')
      .attr('type', 'radio')
      .attr('name', this.name)
      .property('value', ({ value }) => value)
      .property('checked', ({ value }) => value === this.defaultValue)
      .on('change', this.handleChange);
    $labels
      .append('span')
      .attr('class', 'stock-chart-widget__radio-cap')
      .text(({ cap }) => cap);
  }
}

class OHLC {
  constructor(props) {
    const { $parent, items } = props;
    this.$parent = $parent;
    this.items = items;
  }
  updateValue(name, value) {
    this.$items
      .select(`[data-ohlc-name="${name}"]`)
      .text(value);
  }
  render() {
    const $list = this.$parent
      .append('ul')
      .attr('class', 'stock-chart-widget__ohlc-list');
    this.$items = $list
      .selectAll('li')
      .data(this.items)
      .enter()
      .append('li')
      .attr('class', 'stock-chart-widget__ohlc-item');
    this.$items
      .append('span')
      .attr('class', 'stock-chart-widget__ohlc-label')
      .text(({ cap }) => cap);
    this.$items
      .append('span')
      .attr('class', 'stock-chart-widget__ohlc-value')
      .attr('data-ohlc-name', ({ name }) => name)
      .text(({ value }) => value);
  }
}

class Chart {
  static getDateFormat(period) {
    return period === '1d' ?
      d3.timeFormat('%H:%M') :
      d3.timeFormat('%d.%m.%Y');
  }
  static getValueFormat() {
    return d3.format(',.2f');
  }
  static getDataItemFromXCoordinate(coordinate, scale, data) {
    const bisectDate = d3.bisector(({ date }) => date).left;
    const xDate = scale.invert(coordinate);
    const index = bisectDate(data, xDate, 1);
    const prevDataItem = data[index - 1];
    const dataItem = data[index];
    return xDate - prevDataItem.date > dataItem.date - xDate ?
      dataItem :
      prevDataItem;
  }
  constructor(props) {
    const { $parent, period, requestStateUpdate } = props;
    this.width = 0;
    this.height = 0;
    this.marginTop = 20;
    this.marginRight = 20;
    this.marginBottom = 40;
    this.marginLeft = 50;
    this.data = [];
    this.period = period;
    this.duration = 300;
    this.$container = $parent;
    this.requestStateUpdate = requestStateUpdate;
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.updatePeriod = this.updatePeriod.bind(this);
    this.updateData = this.updateData.bind(this);
  }
  handleMouseMove() {
    if (!this.data.length) {
      return;
    }
    const [xCoordinate, yCoordinate] = d3.mouse(this.$focusOverlay.node());
    const dataItem =
      Chart.getDataItemFromXCoordinate(xCoordinate, this.xDateScale, this.data);
    const { date, open, high, low, close } = dataItem;
    this.$xFocusValue.text(Chart.getDateFormat(this.period)(date));
    this.$yFocusValue.text(Chart.getValueFormat()(close));
    const { width: xValueWidth, height: xValueHeight } = this.$xFocusValue.node().getBBox();
    const { width: yValueWidth, height: yValueHeight } = this.$yFocusValue.node().getBBox();
    const paddingX = 12;
    const paddingY = 8;
    const xRectWidth = xValueWidth + paddingX;
    const xRectHeight = xValueHeight + paddingY;
    this.$xFocusValueGroup.attr('transform', `translate(${xCoordinate}, ${this.height + xRectHeight / 2})`);
    this.$xFocusValueRect
      .attr('width', xRectWidth)
      .attr('height', xRectHeight)
      .attr('transform', `translate(${-1 * xRectWidth / 2}, ${-1 * xRectHeight / 2})`);
    const yRectWidth = yValueWidth + paddingX;
    const yRectHeight = yValueHeight + paddingY;
    this.$yFocusValueGroup.attr('transform', `translate(${-1 * yRectWidth / 2}, ${yCoordinate})`);
    this.$yFocusValueRect
      .attr('width', yRectWidth)
      .attr('height', yRectHeight)
      .attr('transform', `translate(${-1 * yRectWidth / 2}, ${-1 * yRectHeight / 2})`);
    this.$xFocusLine.attr('x1', xCoordinate).attr('x2', xCoordinate);
    this.$yFocusLine.attr('y1', yCoordinate).attr('y2', yCoordinate);
    this.requestStateUpdate({
      open: Chart.getValueFormat()(open),
      high: Chart.getValueFormat()(high),
      low: Chart.getValueFormat()(low),
      close: Chart.getValueFormat()(close),
    });
  }
  handleMouseOver() {
    if (!this.data.length) {
      return;
    }
    this.$focusGroup.style('opacity', '1');
    this.$xFocusLine.style('opacity', '1');
    this.$yFocusLine.style('opacity', '1');
  }
  handleMouseOut() {
    if (!this.data.length) {
      return;
    }
    this.$focusGroup.style('opacity', '0');
    this.$xFocusLine.style('opacity', '0');
    this.$yFocusLine.style('opacity', '0');
  }
  updatePeriod(period) {
    this.period = period;
  }
  updateData(rawData) {
    this.data = rawData
      .map(item => {
        item.date = this.period === '1d' ?
          d3.timeParse('%Y%m%d %H:%M')(`${item.date} ${item.minute}`) :
          d3.timeParse('%Y-%m-%d')(item.date);
        return item;
      })
      .filter(({ open, high, low, close }) =>
        open > 0 && high > 0 && low > 0 && close > 9);
  }
  updatePrice({ open, close }) {
    const price = close && close.price ?
      close.price :
      open.price;
    const yCoordinate = this.yScale(price);
    this.$priceValue.text(Chart.getValueFormat()(price));
    const { width, height } = this.$priceValue.node().getBBox();
    const paddingX = 12;
    const paddingY = 8;
    const rectWidth = width + paddingX;
    const rectHeight = height + paddingY;
    this.$priceGroup
      .transition()
      .duration(this.duration)
      .attr('transform', `translate(${-1 * rectWidth / 2}, ${yCoordinate})`);
    this.$priceRect
      .attr('width', rectWidth)
      .attr('height', rectHeight)
      .transition()
      .duration(this.duration)
      .attr('transform', `translate(${-1 * rectWidth / 2}, ${-1 * rectHeight / 2})`);
    this.$priceLine
      .transition()
      .duration(this.duration)
      .attr('y1', yCoordinate)
      .attr('y2', yCoordinate);
  }
  updateLine() {
    const dateExtent = d3.extent(this.data, ({ date }) => date);
    const closeExtent = d3.extent(this.data, ({ close }) => close);
    this.xDateScale.domain(dateExtent);
    this.yScale.domain(closeExtent);
    const xAxis = d3.axisBottom(this.xDateScale).tickFormat(Chart.getDateFormat(this.period));
    const yAxis = d3.axisLeft(this.yScale).tickFormat(d3.format(',.0f'));
    this.$xAxis
      .transition()
      .duration(this.duration)
      .call(xAxis);
    this.$yAxis
      .transition()
      .duration(this.duration)
      .call(yAxis);
    this.$xGrid
      .transition()
      .duration(this.duration)
      .call(xAxis.tickSize(-this.height).tickFormat(''));
    this.$yGrid
      .transition()
      .duration(this.duration)
      .call(yAxis.tickSize(-this.width).tickFormat(''));
    this.$candleGroup.style('opacity', '0');
    this.$linePath.style('opacity', '1');
    this.$lineArea.style('opacity', '1');
    const line = d3.line()
      .x(({ date }) => this.xDateScale(date))
      .y(({ close }) => this.yScale(close));
    const area = d3.area()
      .x(({ date }) => this.xDateScale(date))
      .y0(this.height)
      .y1(({ close }) => this.yScale(close));
    this.$linePath
      .datum(this.data)
      .transition()
      .duration(this.duration)
      .attr('d', line);
    this.$lineArea
      .datum(this.data)
      .style('fill', 'url(#stock-chart-widget__area-gradient)')
      .transition()
      .duration(this.duration)
      .attr('d', area);
  }
  updateCandle() {
    const dateExtent = d3.extent(this.data, ({ date }) => date);
    const dataRange = [-1, this.data.length];
    const yMin = d3.min(this.data.map(d => d.low));
    const yMax = d3.max(this.data.map(d => d.high));
    this.xBand.domain(d3.range(dataRange[0], dataRange[1]));
    this.xDateScale.domain(dateExtent).nice();
    this.xScale.domain(dataRange);
    this.yScale.domain([yMin, yMax]);
    const xAxis = d3.axisBottom(this.xDateScale).tickFormat(Chart.getDateFormat(this.period));
    const yAxis = d3.axisLeft(this.yScale).tickFormat(d3.format(',.0f'));
    this.$xAxis
      .transition()
      .duration(this.duration)
      .call(xAxis);
    this.$yAxis
      .transition()
      .duration(this.duration)
      .call(yAxis);
    this.$xGrid
      .transition()
      .duration(this.duration)
      .call(xAxis.tickSize(-this.height).tickFormat(''));
    this.$yGrid
      .transition()
      .duration(this.duration)
      .call(yAxis.tickSize(-this.width).tickFormat(''));
    this.$linePath.style('opacity', '0');
    this.$lineArea.style('opacity', '0');
    this.$candleGroup.style('opacity', '1');
    const $candleRects = this.$candleGroup
      .selectAll('.stock-chart-widget__candle-candle')
      .data(this.data);
    $candleRects
      .exit()
      .transition()
      .duration(this.duration)
      .attr('y', 0)
      .style('opacity', '0')
      .remove();
    $candleRects
      .transition()
      .duration(this.duration)
      .attr('class', 'stock-chart-widget__candle-candle')
      .attr('x', (d, i) => this.xScale(i) - this.xBand.bandwidth())
      .attr('y', ({ open, close }) => this.yScale(Math.max(open, close)))
      .attr('width', this.xBand.bandwidth())
      .attr('height', ({ open, close }) => (open !== close) ?
        this.yScale(Math.min(open, close)) - this.yScale(Math.max(open, close)) :
        1
      )
      .attr('class', ({ open, close }) => (open === close) ?
        'stock-chart-widget__candle-candle stock-chart-widget__candle_equal' :
        (open > close) ?
          'stock-chart-widget__candle-candle stock-chart-widget__candle_higher' :
          'stock-chart-widget__candle-candle stock-chart-widget__candle_lower'
      );
    $candleRects.enter()
      .append('rect')
      .style('opacity', '0')
      .attr('y', this.height)
      .transition()
      .duration(this.duration)
      .attr('class', 'stock-chart-widget__candle-candle')
      .style('opacity', '1')
      .attr('x', (d, i) => this.xScale(i) - this.xBand.bandwidth())
      .attr('y', ({ open, close }) => this.yScale(Math.max(open, close)))
      .attr('width', this.xBand.bandwidth())
      .attr('height', ({ open, close }) => (open !== close) ?
        this.yScale(Math.min(open, close)) - this.yScale(Math.max(open, close)) :
        1
      )
      .attr('class', ({ open, close }) => (open === close) ?
        'stock-chart-widget__candle-candle stock-chart-widget__candle_equal' :
        (open > close) ?
          'stock-chart-widget__candle-candle stock-chart-widget__candle_higher' :
          'stock-chart-widget__candle-candle stock-chart-widget__candle_lower'
      );
    const $candleLines = this.$candleGroup
      .selectAll('.stock-chart-widget__candle-stem')
      .data(this.data);
    $candleLines
      .exit()
      .transition()
      .duration(this.duration)
      .attr('y1', this.height)
      .attr('y2', this.height)
      .style('opacity', '0')
      .remove();
    $candleLines
      .transition()
      .duration(this.duration)
      .attr('class', 'stock-chart-widget__candle-stem')
      .attr('x1', (d, i) => this.xScale(i) - this.xBand.bandwidth() / 2)
      .attr('x2', (d, i) => this.xScale(i) - this.xBand.bandwidth() / 2)
      .attr('y1', ({ high }) => this.yScale(high))
      .attr('y2', ({ low }) => this.yScale(low))
      .attr('class', ({ open, close }) => (open === close) ?
        'stock-chart-widget__candle-stem stock-chart-widget__candle_equal' :
        (open > close) ?
          'stock-chart-widget__candle-stem stock-chart-widget__candle_higher' :
          'stock-chart-widget__candle-stem stock-chart-widget__candle_lower'
      );
    $candleLines.enter()
      .append('line')
      .style('opacity', '0')
      .transition()
      .duration(this.duration)
      .attr('class', 'stock-chart-widget__candle-stem')
      .style('opacity', '1')
      .attr('x1', (d, i) => this.xScale(i) - this.xBand.bandwidth() / 2)
      .attr('x2', (d, i) => this.xScale(i) - this.xBand.bandwidth() / 2)
      .attr('y1', ({ high }) => this.yScale(high))
      .attr('y2', ({ low }) => this.yScale(low))
      .attr('class', ({ open, close }) => (open === close) ?
        'stock-chart-widget__candle-stem stock-chart-widget__candle_equal' :
        (open > close) ?
          'stock-chart-widget__candle-stem stock-chart-widget__candle_higher' :
          'stock-chart-widget__candle-stem stock-chart-widget__candle_lower'
      );
  }
  render() {
    if (this.$mainGroup) {
      console.warn('Chart is already rendered');
      return;
    }
    const { clientWidth, clientHeight } = this.$container.node();
    this.width = clientWidth - this.marginLeft - this.marginRight;
    this.height = clientHeight - this.marginTop - this.marginBottom;
    this.$mainGroup = this.$container
      .append('g')
      .attr('class', 'stock-chart-widget__main-group')
      .attr('transform', `translate(${this.marginLeft}, ${this.marginTop})`);
    /* axis */
    this.xBand = d3.scaleBand().rangeRound([0, this.width]).padding(0.5);
    this.xDateScale = d3.scaleTime().rangeRound([0, this.width]);
    this.xScale = d3.scaleLinear().rangeRound([0, this.width]);
    this.yScale = d3.scaleLinear().rangeRound([this.height, 0]);
    const xAxis = d3.axisBottom(this.xScale).tickFormat('');
    const yAxis = d3.axisLeft(this.yScale).tickFormat('');
    this.$xAxis = this.$mainGroup.append('g')
      .attr('class', 'stock-chart-widget__x-axis')
      .attr('transform', `translate(0, ${this.height})`)
      .call(xAxis);
    this.$yAxis = this.$mainGroup.append('g')
      .attr('class', 'stock-chart-widget__y-axis')
      .call(yAxis);
    const xAxisHeight = this.$xAxis.node().getBBox().height;
    const yAxisWidth = this.$yAxis.node().getBBox().width;
    /* grid */
    this.$xGrid = this.$mainGroup.append('g').attr('class', 'stock-chart-widget__grid')
      .attr('transform', `translate(0, ${this.height})`)
      .call(xAxis.tickSize(-this.height).tickFormat(''));
    this.$yGrid = this.$mainGroup.append('g').attr('class', 'stock-chart-widget__grid')
      .call(yAxis.tickSize(-this.width).tickFormat(''));
    /* line */
    const $areaGradient = this.$mainGroup
      .append('defs')
      .append('linearGradient')
      .attr('id', 'stock-chart-widget__area-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    $areaGradient.append('stop')
      .attr('class', 'stock-chart-widget__area-gradient-stop')
      .attr('offset', '0%')
      .attr('stop-opacity', 0.6);
    $areaGradient.append('stop')
      .attr('class', 'stock-chart-widget__area-gradient-stop')
      .attr('offset', '80%')
      .attr('stop-opacity', 0);
    this.$linePath = this.$mainGroup.append('path')
      .attr('class', 'stock-chart-widget__line-path');
    this.$lineArea = this.$mainGroup.append('path')
      .attr('class', 'stock-chart-widget__line-area');
    /* candle */
    this.$candleGroup = this.$mainGroup.append('g')
      .attr('class', 'stock-chart-widget__candle-group');
    this.$candleGroup.selectAll('.stock-chart-widget__candle-candle');
    this.$candleGroup.selectAll('.stock-chart-widget__candle-stem');
    /* price */
    this.$priceGroup = this.$mainGroup.append('g')
     .attr('transform', `translate(${-1 * yAxisWidth}, 0)`);
    this.$priceRect = this.$priceGroup.append('rect')
      .attr('class', 'stock-chart-widget__price-rect')
      .attr('x', 0)
      .attr('y', 0);
    this.$priceValue = this.$priceGroup.append('text')
      .attr('class', 'stock-chart-widget__price-value')
      .attr('x', 0)
      .attr('y', 0);
    this.$priceLine = this.$mainGroup.append('line')
      .attr('class', 'stock-chart-widget__price-line')
      .attr('x1', 0)
      .attr('y1', this.height)
      .attr('x2', this.width)
      .attr('y2', this.height);
    /* focus */
    this.$focusGroup = this.$mainGroup.append('g')
      .attr('class', 'stock-chart-widget__focus-group');
    this.$xFocusValueGroup = this.$focusGroup.append('g')
      .attr('transform', `translate(0, ${this.height + xAxisHeight})`);
    this.$xFocusValueRect = this.$xFocusValueGroup.append('rect')
      .attr('class', 'stock-chart-widget__focus-value-rect')
      .attr('x', 0)
      .attr('y', 0);
    this.$xFocusValue = this.$xFocusValueGroup.append('text')
      .attr('class', 'stock-chart-widget__focus-value')
      .attr('x', 0)
      .attr('y', 0);
    this.$yFocusValueGroup = this.$focusGroup.append('g')
      .attr('transform', `translate(${-1 * yAxisWidth}, 0)`);
    this.$yFocusValueRect = this.$yFocusValueGroup.append('rect')
      .attr('class', 'stock-chart-widget__focus-value-rect')
      .attr('x', 0)
      .attr('y', 0);
    this.$yFocusValue = this.$yFocusValueGroup.append('text')
      .attr('class', 'stock-chart-widget__focus-value')
      .attr('x', 0)
      .attr('y', 0);
    this.$xFocusLine = this.$mainGroup.append('line')
      .attr('class', 'stock-chart-widget__x-focus-line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 0)
      .attr('y2', this.height);
    this.$yFocusLine = this.$mainGroup.append('line')
      .attr('class', 'stock-chart-widget__y-focus-line')
      .attr('x1', 0)
      .attr('y1', this.height)
      .attr('x2', this.width)
      .attr('y2', this.height);
    /* focus overlay */
    this.$focusOverlay = this.$mainGroup.append('rect')
      .attr('class', 'stock-chart-widget__focus-overlay')
      .attr('width', this.width)
      .attr('height', this.height)
      .on('mouseover', this.handleMouseOver)
      .on('mouseout', this.handleMouseOut)
      .on('mousemove', this.handleMouseMove);
  }
}

class Widget {
  constructor(props) {
    const { rootSelector } = props;
    this.rootSelector = rootSelector;
    this.state = new State({
      symbol: 'aapl',
      open: '—',
      high: '—',
      low: '—',
      close: '—',
      period: '6m',
      type: 'line',
      isFetching: false,
      stocksData: [],
      stockPrice: '—',
    });
    this.stockDataRefreshRate = 1000 * 30;
    this.handleStateUpdateRequest = this.handleStateUpdateRequest.bind(this);
  }
  async fetchStockPrice(symbol) {
    try {
      const url = `https://api.iextrading.com/1.0/stock/${symbol}/ohlc`;
      const data = await d3.json(url);
      this.state.update('stockPrice', data);
    } catch (e) {
      console.warn(e);
    }
  }
  async fetchStockData(symbol, period) {
    if (this.state.get('isFetching')) {
      return;
    }
    this.state.update('isFetching', true);
    try {
      const url = `https://api.iextrading.com/1.0/stock/${symbol}/chart/${period}`;
      const data = await d3.json(url);
      this.state.update('stocksData', data);
    } catch (e) {
      console.warn(e);
    } finally {
      this.state.update('isFetching', false);
      await this.fetchStockPrice(symbol);
    }
  }
  refreshStockData() {
    const symbol = this.state.get('symbol');
    const period = this.state.get('period');
    this.chart.updatePeriod(period);
    this.$heading.text(`График акций ${symbol.toUpperCase()}`);
    this.fetchStockData(symbol, period);
  }
  replaceScript() {
    const root = this.$root.node();
    const parent = root.parentNode;
    const article = this.$article.node();
    parent.appendChild(article);
    parent.removeChild(root);
  }
  handleStateUpdateRequest(nextState) {
    Object.entries(nextState).forEach(([name, value]) =>
      this.state.update(name, value));
  }
  render() {
    this.$root = d3.select(this.rootSelector);
    this.$article = this.$root.append('article').attr('class', 'stock-chart-widget');
    this.replaceScript();
    const $header = this.$article.append('header').attr('class', 'stock-chart-widget__header');
    this.$heading = $header.append('h1').attr('class', 'stock-chart-widget__title');
    const symbolRadioField = new RadioField({
      $parent: $header,
      name: 'symbol',
      defaultValue: this.state.get('symbol'),
      items: SYMBOLS,
      requestStateUpdate: this.handleStateUpdateRequest,
    });
    symbolRadioField.render();
    const $main = this.$article.append('main').attr('class', 'stock-chart-widget__main');
    const ohlc = new OHLC({
      $parent: $main,
      items: OHLC_LIST,
    });
    ohlc.render();
    const $chart = $main.append('svg').attr('class', 'stock-chart-widget__container');
    this.chart = new Chart({
      $parent: $chart,
      period: this.state.get('period'),
      requestStateUpdate: this.handleStateUpdateRequest,
    });
    const $footer = this.$article.append('footer').attr('class', 'stock-chart-widget__footer');
    const periodRadioField = new RadioField({
      $parent: $footer,
      name: 'period',
      defaultValue: this.state.get('period'),
      items: PERIODS,
      requestStateUpdate: this.handleStateUpdateRequest,
    });
    periodRadioField.render();
    const typeRadioField = new RadioField({
      $parent: $footer,
      name: 'type',
      defaultValue: this.state.get('type'),
      items: TYPES,
      requestStateUpdate: this.handleStateUpdateRequest,
    });
    typeRadioField.render();
    typeRadioField.$list.classed('stock-chart-widget__footer-type-list', true);
    this.chart.render();
    this.state.subscribe('symbol', () => this.refreshStockData());
    this.state.subscribe('period', () => this.refreshStockData());
    this.state.subscribe('open', (open) => {
      ohlc.updateValue('open', open);
    });
    this.state.subscribe('high', (high) => {
      ohlc.updateValue('high', high);
    });
    this.state.subscribe('low', (low) => {
      ohlc.updateValue('low', low);
    });
    this.state.subscribe('close', (close) => {
      ohlc.updateValue('close', close);
    });
    this.state.subscribe('stocksData', (stocksData) => {
      this.chart.updateData(stocksData);
      this.state.get('type') === 'line' ?
        this.chart.updateLine() :
        this.chart.updateCandle();
    });
    this.state.subscribe('type', (type) => {
      type === 'line' ?
        this.chart.updateLine() :
        this.chart.updateCandle();
    });
    this.state.subscribe('isFetching', (isFetching) => {
      this.$article.classed('stock-chart-widget_loading', isFetching);
      if (isFetching) {
        symbolRadioField.disable();
        periodRadioField.disable();
        typeRadioField.disable();
      } else {
        symbolRadioField.enable();
        periodRadioField.enable();
        typeRadioField.enable();
      }
    });
    this.state.subscribe('stockPrice', (stockPrice) => {
      this.chart.updatePrice(stockPrice);
    });
    this.refreshStockData();
    setInterval(() => this.refreshStockData(), this.stockDataRefreshRate)
  }
}

const documentReady = () => new Promise((resolve) => {
  document.readyState === 'complete' ?
    resolve() :
    window.addEventListener('load', resolve, true);
});

(async () => {
  try {
    await documentReady();
    new Widget({ rootSelector: '[data-stock-chart-widget]' }).render()
  } catch (e) {
    console.warn(e);
  }
})();

