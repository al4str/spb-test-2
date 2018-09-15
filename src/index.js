require('babel-polyfill');
const d3 = require('d3');
const ruTimeLocale = require('d3-time-format/locale/ru-RU');

const documentReady = () => new Promise((resolve) => {
  document.readyState === 'complete' ?
    resolve() :
    window.addEventListener('load', resolve, true);
});

let isFetching = false;
const fetchStockData = async (symbol, period) => {
  if (isFetching) {
    return;
  }
  isFetching = true;
  try {
    const url = `https://api.iextrading.com/1.0/stock/${symbol}/chart/${period}`;
    return await d3.json(url);
  } catch (e) {
    console.warn(e);
    return null;
  } finally {
    isFetching = false;
  }
};

const listenRadioGroupChanges = ($d3Target, handler, initialValue) => {
  if (!$d3Target || typeof handler !== 'function') {
    return;
  }
  $d3Target.selectAll('input[type="radio"]').on('change', handler);
  $d3Target.select(`input[value="${initialValue}"]`).node().checked = true;
};

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
    if (!this.subscribers[name]) {
      this.subscribers[name] = [];
    }
    this.subscribers[name].push(subscriber);
  }
  callAllSubscribers() {
    Object.entries(this.subscribers).forEach(([name, subscribers]) => {
      const value = this.get(name);
      subscribers.forEach(subscriber => subscriber(value));
    });
  }
}

class Chart {
  static getDateFormat(isDay) {
    return isDay ?
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
    const { $container, requestStateUpdate } = props;
    this.width = 0;
    this.height = 0;
    this.marginTop = 20;
    this.marginRight = 20;
    this.marginBottom = 40;
    this.marginLeft = 60;
    this.data = [];
    this.duration = 300;
    this.$container = $container;
    this.$mainGroup = null;
    this.requestStateUpdate = requestStateUpdate;
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
  }
  updateData(rawData, isDay) {
    this.data = rawData.map(item => {
      item.date = isDay ?
        d3.timeParse('%Y%m%d %H:%M')(`${item.date} ${item.minute}`) :
        d3.timeParse('%Y-%m-%d')(item.date);
      return item;
    });
  }
  handleMouseMove(isDay) {
    if (!this.data.length) {
      return;
    }
    const [xCoordinate, yCoordinate] = d3.mouse(this.$focusOverlay.node());
    const dataItem =
      Chart.getDataItemFromXCoordinate(xCoordinate, this.xDateScale, this.data);
    const { date, open, high, low, close } = dataItem;
    this.$xFocusValue.text(Chart.getDateFormat(isDay)(date));
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
  renderLine(isDay) {
    const dateExtent = d3.extent(this.data, ({ date }) => date);
    const closeExtent = d3.extent(this.data, ({ close }) => close);
    this.xDateScale.domain(dateExtent);
    this.yScale.domain(closeExtent);
    const xAxis = d3.axisBottom(this.xDateScale).tickFormat(Chart.getDateFormat(isDay));
    const yAxis = d3.axisLeft(this.yScale).tickFormat(d3.format(',.0f'));
    this.$xAxis
      .transition()
      .duration(this.duration)
      .call(xAxis);
    this.$yAxis
      .transition()
      .duration(this.duration)
      .call(yAxis);
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
      .style('fill', 'url(#areaGradient)')
      .transition()
      .duration(this.duration)
      .attr('d', area);
  }
  renderCandle(isDay) {
    const dateExtent = d3.extent(this.data, ({ date }) => date);
    const dataRange = [-1, this.data.length];
    const yMin = d3.min(this.data.map(d => d.low));
    const yMax = d3.max(this.data.map(d => d.high));
    this.xBand.domain(d3.range(dataRange[0], dataRange[1]));
    this.xDateScale.domain(dateExtent);
    this.xScale.domain(dataRange);
    this.yScale.domain([yMin, yMax]);
    const xAxis = d3.axisBottom(this.xDateScale).tickFormat(Chart.getDateFormat(isDay));
    const yAxis = d3.axisLeft(this.yScale).tickFormat(d3.format(',.0f'));
    this.$xAxis
      .transition()
      .duration(this.duration)
      .call(xAxis);
    this.$yAxis
      .transition()
      .duration(this.duration)
      .call(yAxis);
    this.$linePath.style('opacity', '0');
    this.$lineArea.style('opacity', '0');
    this.$candleGroup.style('opacity', '1');
    const $candleRects = this.$candleGroup
      .selectAll('.chart__candle-candle')
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
      .attr('class', 'chart__candle-candle')
      .attr('x', (d, i) => this.xScale(i) - this.xBand.bandwidth())
      .attr('y', ({ open, close }) => this.yScale(Math.max(open, close)))
      .attr('width', this.xBand.bandwidth())
      .attr('height', ({ open, close }) => (open !== close) ?
        this.yScale(Math.min(open, close)) - this.yScale(Math.max(open, close)) :
        1
      )
      .attr('class', ({ open, close }) => (open === close) ?
        'chart__candle-candle chart__candle_equal' :
        (open > close) ?
          'chart__candle-candle chart__candle_higher' :
          'chart__candle-candle chart__candle_lower'
      );
    $candleRects.enter()
      .append('rect')
      .style('opacity', '0')
      .attr('y', this.height)
      .transition()
      .duration(this.duration)
      .attr('class', 'chart__candle-candle')
      .style('opacity', '1')
      .attr('x', (d, i) => this.xScale(i) - this.xBand.bandwidth())
      .attr('y', ({ open, close }) => this.yScale(Math.max(open, close)))
      .attr('width', this.xBand.bandwidth())
      .attr('height', ({ open, close }) => (open !== close) ?
        this.yScale(Math.min(open, close)) - this.yScale(Math.max(open, close)) :
        1
      )
      .attr('class', ({ open, close }) => (open === close) ?
        'chart__candle-candle chart__candle_equal' :
        (open > close) ?
          'chart__candle-candle chart__candle_higher' :
          'chart__candle-candle chart__candle_lower'
      );
    const $candleLines = this.$candleGroup
      .selectAll('.chart__candle-stem')
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
      .attr('class', 'chart__candle-stem')
      .attr('x1', (d, i) => this.xScale(i) - this.xBand.bandwidth() / 2)
      .attr('x2', (d, i) => this.xScale(i) - this.xBand.bandwidth() / 2)
      .attr('y1', ({ high }) => this.yScale(high))
      .attr('y2', ({ low }) => this.yScale(low))
      .attr('class', ({ open, close }) => (open === close) ?
        'chart__candle-stem chart__candle_equal' :
        (open > close) ?
          'chart__candle-stem chart__candle_higher' :
          'chart__candle-stem chart__candle_lower'
      );
    $candleLines.enter()
      .append('line')
      .style('opacity', '0')
      .transition()
      .duration(this.duration)
      .attr('class', 'chart__candle-stem')
      .style('opacity', '1')
      .attr('x1', (d, i) => this.xScale(i) - this.xBand.bandwidth() / 2)
      .attr('x2', (d, i) => this.xScale(i) - this.xBand.bandwidth() / 2)
      .attr('y1', ({ high }) => this.yScale(high))
      .attr('y2', ({ low }) => this.yScale(low))
      .attr('class', ({ open, close }) => (open === close) ?
        'chart__candle-stem chart__candle_equal' :
        (open > close) ?
          'chart__candle-stem chart__candle_higher' :
          'chart__candle-stem chart__candle_lower'
      );
  }
  renderChart(isDay) {
    if (this.$mainGroup) {
      console.warn('Chart is already rendered');
      return;
    }
    const parentNode = this.$container.node().parentNode;
    this.width = parentNode.clientWidth - this.marginLeft - this.marginRight;
    this.height = parentNode.clientHeight - this.marginTop - this.marginBottom;
    this.$mainGroup = this.$container
      .append('g')
      .attr('class', 'chart__main-group')
      .attr('transform', `translate(${this.marginLeft}, ${this.marginTop})`);
    /* axis */
    this.xBand = d3.scaleBand().rangeRound([0, this.width]).padding(0.5);
    this.xDateScale = d3.scaleTime().rangeRound([0, this.width]);
    this.xScale = d3.scaleLinear().rangeRound([0, this.width]);
    this.yScale = d3.scaleLinear().rangeRound([this.height, 0]);
    const xAxis = d3.axisBottom(this.xScale).tickFormat('');
    const yAxis = d3.axisLeft(this.yScale).tickFormat('');
    this.$xAxis = this.$mainGroup.append('g')
      .attr('class', 'chart__x-axis')
      .attr('transform', `translate(0, ${this.height})`)
      .call(xAxis);
    this.$yAxis = this.$mainGroup.append('g')
      .attr('class', 'chart__y-axis')
      .call(yAxis);
    /* grid */
    this.$mainGroup.append('g').attr('class', 'chart__grid')
      .attr('transform', `translate(0, ${this.height})`)
      .call(xAxis.tickSize(-this.height).tickFormat(''));
    this.$mainGroup.append('g').attr('class', 'chart__grid')
      .call(yAxis.tickSize(-this.width).tickFormat(''));
    /* focus */
    this.$xFocusLine = this.$mainGroup.append('line')
      .attr('class', 'chart__x-focus-line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 0)
      .attr('y2', this.height);
    this.$yFocusLine = this.$mainGroup.append('line')
      .attr('class', 'chart__y-focus-line')
      .attr('x1', 0)
      .attr('y1', this.height)
      .attr('x2', this.width)
      .attr('y2', this.height);
    this.$focusGroup = this.$mainGroup.append('g')
      .attr('class', 'chart__focus-group');
    const xAxisHeight = this.$xAxis.node().getBBox().height;
    this.$xFocusValueGroup = this.$focusGroup.append('g')
      .attr('transform', `translate(0, ${this.height + xAxisHeight})`);
    this.$xFocusValueRect = this.$xFocusValueGroup.append('rect')
      .attr('class', 'chart__focus-value-rect')
      .attr('x', 0)
      .attr('y', 0);
    this.$xFocusValue = this.$xFocusValueGroup.append('text')
      .attr('class', 'chart__focus-value')
      .attr('x', 0)
      .attr('y', 0);
    const yAxisWidth = this.$yAxis.node().getBBox().width;
    this.$yFocusValueGroup = this.$focusGroup.append('g')
      .attr('transform', `translate(${-1 * yAxisWidth}, 0)`);
    this.$yFocusValueRect = this.$yFocusValueGroup.append('rect')
      .attr('class', 'chart__focus-value-rect')
      .attr('x', 0)
      .attr('y', 0);
    this.$yFocusValue = this.$yFocusValueGroup.append('text')
      .attr('class', 'chart__focus-value')
      .attr('x', 0)
      .attr('y', 0);
    /* line */
    const $areaGradient = this.$mainGroup
      .append('defs')
      .append('linearGradient')
      .attr('id', 'areaGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    $areaGradient.append('stop')
      .attr('class', 'chart__area-gradient-stop')
      .attr('offset', '0%')
      .attr('stop-opacity', 0.6);
    $areaGradient.append('stop')
      .attr('class', 'chart__area-gradient-stop')
      .attr('offset', '80%')
      .attr('stop-opacity', 0);
    this.$linePath = this.$mainGroup.append('path')
      .attr('class', 'chart__line-path');
    this.$lineArea = this.$mainGroup.append('path')
      .attr('class', 'chart__line-area');
    /* candle */
    this.$candleGroup = this.$mainGroup.append('g')
      .attr('class', 'chart__candle-group');
    this.$candleGroup.selectAll('.chart__candle-candle');
    this.$candleGroup.selectAll('.chart__candle-stem');
    /* focus overlay */
    this.$focusOverlay = this.$mainGroup.append('rect')
      .attr('class', 'chart__focus-overlay')
      .attr('width', this.width)
      .attr('height', this.height)
      .on('mouseover', this.handleMouseOver.bind(isDay))
      .on('mouseout', this.handleMouseOut)
      .on('mousemove', this.handleMouseMove);
  }
}

/*
const renderLineChart = ($chart, rawData, state) => {
  if (!rawData.length) {
    return;
  }
  $chart.selectAll('*').remove();
  const isDayPeriod = state.get('period') === '1d';
  const valueFormat = d3.format(',.2f');
  const dateFormat = isDayPeriod ? d3.timeFormat('%H:%M') : d3.timeFormat('%x');
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const width = +$chart.attr('width') - margin.left - margin.right;
  const height = +$chart.attr('height') - margin.top - margin.bottom;

  const x = d3.scaleTime().rangeRound([0, width]);
  const y = d3.scaleLinear().range([height, 0]);
  const xAxis = d3.axisBottom(x).ticks(5, dateFormat);
  const yAxis = d3.axisLeft(y).tickFormat(d3.format(',.0f'));
  const line = d3.line()
    .x(({ date }) => x(date))
    .y(({ close, high }) => y(isDayPeriod ? high : close));
  const area = d3.area()
    .x(({ date }) => x(date))
    .y0(height)
    .y1(({ close, high }) => y(isDayPeriod ? high : close));

  const $group = $chart.append('g').attr('class', 'inner')
    .attr('transform', `translate(${margin.left}, ${margin.top})`);
  const $path = $group.append('path');

  const data = rawData.map(item => {
    item.date = isDayPeriod ?
      d3.timeParse('%Y%m%d %H:%M')(`${item.date} ${item.minute}`) :
      d3.timeParse('%Y-%m-%d')(item.date);
    return item;
  });
  x.domain(d3.extent(data, ({ date }) => date));
  y.domain(d3.extent(data, ({ close, high }) => isDayPeriod ? high : close));

  const $xAxis = $group.append('g').attr('class', 'xAxis')
    .attr('transform', `translate(0, ${height})`).call(xAxis);
  const $yAxis = $group.append('g').attr('class', 'yAxis')
    .call(yAxis);

  $group.append('g').attr('class', 'grid')
    .attr('transform', `translate(0, ${height})`)
    .call(xAxis.tickSize(-height).tickFormat(''));
  $group.append('g').attr('class', 'grid')
    .call(yAxis.tickSize(-width).tickFormat(''));

  $path.datum(data).attr('class', 'linePath').attr('d', line);

  const $xLine = $group.append('line')
    .attr('x1', 0)
    .attr('y1', 0)
    .attr('x2', 0)
    .attr('y2', height)
    .attr('class', 'xLine');
  const $yLine = $group.append('line')
    .attr('x1', 0)
    .attr('y1', height)
    .attr('x2', width)
    .attr('y2', height)
    .attr('class', 'yLine');

  const areaGradient = $group.append('defs')
    .append('linearGradient')
    .attr('id', 'areaGradient')
    .attr('x1', '0%').attr('y1', '0%')
    .attr('x2', '0%').attr('y2', '100%');
  areaGradient.append('stop')
    .attr('offset', '0%')
    .attr('stop-color', '#21825C')
    .attr('stop-opacity', 0.6);
  areaGradient.append('stop')
    .attr('offset', '80%')
    .attr('stop-color', 'white')
    .attr('stop-opacity', 0);
  $group.append('path').attr('class', 'area')
    .datum(data).style('fill', 'url(#areaGradient)').attr('d', area);

  const bisectDate = d3.bisector(({ date }) => date).left;
  const $focus = $group.append('g').attr('class', 'focus');
  const xAxisHeight = $xAxis.node().getBBox().height;
  const $xValueGroup = $focus.append('g').attr('transform', `translate(0, ${height + xAxisHeight})`);
  const $xValueRect = $xValueGroup.append('rect').attr('class', 'focusValueRect').attr('x', 0).attr('y', 0);
  const $xValue = $xValueGroup.append('text').attr('class', 'focusValue').attr('x', 0).attr('y', 0);
  const yAxisWidth = $yAxis.node().getBBox().width;
  const $yValueGroup = $focus.append('g').attr('transform', `translate(${-1 * yAxisWidth}, 0)`);
  const $yValueRect = $yValueGroup.append('rect').attr('class', 'focusValueRect').attr('x', 0).attr('y', 0);
  const $yValue = $yValueGroup.append('text').attr('class', 'focusValue').attr('x', 0).attr('y', 0);
  $group.append('rect').attr('class', 'focusOverlay').attr('width', width).attr('height', height)
    .on('mouseover', () => {
      $focus.style('opacity', '1');
      $xLine.style('opacity', '1');
      $yLine.style('opacity', '1');
    })
    .on('mouseout', () => {
      $focus.style('opacity', '0');
      $xLine.style('opacity', '0');
      $yLine.style('opacity', '0');
    })
    .on('mousemove', () => {
      const [xCoordinate, yCoordinate] = d3.mouse($group.node());
      const x0 = x.invert(xCoordinate);
      const i = bisectDate(data, x0, 1);
      const d0 = data[i - 1];
      const d1 = data[i];
      const d = x0 - d0.date > d1.date - x0 ? d1 : d0;

      $xValue.text(dateFormat(d.date));
      const { width: xValueWidth, height: xValueHeight } = $xValue.node().getBBox();
      const xRectWidth = xValueWidth + 12;
      const xRectHeight = xValueHeight + 8;
      $xValueGroup.attr('transform', `translate(${xCoordinate}, ${height + xRectHeight / 2})`);
      $xValueRect.attr('width', xRectWidth).attr('height', xRectHeight)
        .attr('transform', `translate(${-1 * xRectWidth / 2}, ${-1 * xRectHeight / 2})`);

      $yValue.text(valueFormat(isDayPeriod ? d.high : d.close));
      const { width: yValueWidth, height: yValueHeight } = $yValue.node().getBBox();
      const yRectWidth = yValueWidth + 12;
      const yRectHeight = yValueHeight + 8;
      $yValueGroup.attr('transform', `translate(${-1 * yRectWidth / 2}, ${yCoordinate})`);
      $yValueRect.attr('width', yRectWidth).attr('height', yRectHeight)
        .attr('transform', `translate(${-1 * yRectWidth / 2}, ${-1 * yRectHeight / 2})`);

      $xLine.attr('x1', xCoordinate).attr('x2', xCoordinate);
      $yLine.attr('y1', yCoordinate).attr('y2', yCoordinate);

      state.update('open', valueFormat(d.open));
      state.update('high', valueFormat(d.high));
      state.update('low', valueFormat(d.low));
      state.update('close', valueFormat(d.close));
    });
};
*/
/*
const renderCandleChart = ($chart, rawData, state) => {
  if (!rawData.length) {
    return;
  }
  $chart.selectAll('*').remove();
  const isDayPeriod = state.get('period') === '1d';
  const valueFormat = d3.format(',.2f');
  const dateFormat = isDayPeriod ? d3.timeFormat('%H:%M') : d3.timeFormat('%d.%m.%y');
  const bisectDate = d3.bisector(({ date }) => date).left;
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const width = +$chart.attr('width') - margin.left - margin.right;
  const height = +$chart.attr('height') - margin.top - margin.bottom;

  const $group = $chart.append('g').attr('class', 'inner')
    .attr('transform', `translate(${margin.left}, ${margin.top})`);

  const datesList = [];
  const data = rawData.map(item => {
    item.date = isDayPeriod ?
      d3.timeParse('%Y%m%d %H:%M')(`${item.date} ${item.minute}`) :
      d3.timeParse('%Y-%m-%d')(item.date);
    datesList.push(item.date);
    return item;
  });

  const dateExtent = d3.extent(data, ({ date }) => date);
  const xDateScale = d3.scaleTime().domain(dateExtent).rangeRound([0, width]);
  const xScale = d3.scaleLinear().domain([-1, datesList.length]).rangeRound([0, width]);
  const xBand = d3.scaleBand().domain(d3.range(-1, datesList.length)).rangeRound([0, width]).padding(0.5);
  const xAxis = d3.axisBottom(xDateScale).ticks(5, dateFormat);

  const yMin = d3.min(data.map(d => d.low));
  const yMax = d3.max(data.map(d => d.high));
  const yScale = d3.scaleLinear().domain([yMin, yMax]).rangeRound([height, 0]).nice();
  const yAxis = d3.axisLeft(yScale).tickFormat(d3.format(',.0f'));

  const $xAxis = $group.append('g').attr('class', 'xAxis')
    .attr('transform', `translate(0, ${height})`).call(xAxis);
  const $yAxis = $group.append('g').attr('class', 'yAxis')
    .call(yAxis);

  $group.append('g').attr('class', 'grid')
    .attr('transform', `translate(0, ${height})`)
    .call(xAxis.tickSize(-height).tickFormat(''));
  $group.append('g').attr('class', 'grid')
    .call(yAxis.tickSize(-width).tickFormat(''));

  const $candleGroup = $group.append('g').attr('class', 'candleGroup');
  $candleGroup.selectAll('.candle').data(data).enter()
    .append('rect').attr('class', 'candle')
    .attr('x', (d, i) => xScale(i) - xBand.bandwidth())
    .attr('y', ({ open, close }) => yScale(Math.max(open, close)))
    .attr('width', xBand.bandwidth())
    .attr('height', ({ open, close }) => (open === close) ?
      1 :
      yScale(Math.min(open, close)) - yScale(Math.max(open, close))
    )
    .attr('class', ({ open, close }) => (open === close) ?
      'equal' :
      (open > close) ?
        'higher' :
        'lower'
    );
  $candleGroup.selectAll('.stem').data(data).enter()
    .append('line').attr('class', 'stem')
    .attr('x1', (d, i) => xScale(i) - xBand.bandwidth() / 2)
    .attr('x2', (d, i) => xScale(i) - xBand.bandwidth() / 2)
    .attr('y1', ({ high }) => yScale(high))
    .attr('y2', ({ low }) => yScale(low))
    .attr('class', ({ open, close }) => (open === close) ?
      'equal' :
      (open > close) ?
        'higher' :
        'lower'
    );

  const $xLine = $group.append('line')
    .attr('x1', 0)
    .attr('y1', 0)
    .attr('x2', 0)
    .attr('y2', height)
    .attr('class', 'xLine');
  const $yLine = $group.append('line')
    .attr('x1', 0)
    .attr('y1', height)
    .attr('x2', width)
    .attr('y2', height)
    .attr('class', 'yLine');

  const $focus = $group.append('g').attr('class', 'focus');
  const xAxisHeight = $xAxis.node().getBBox().height;
  const $xValueGroup = $focus.append('g').attr('transform', `translate(0, ${height + xAxisHeight})`);
  const $xValueRect = $xValueGroup.append('rect').attr('class', 'focusValueRect').attr('x', 0).attr('y', 0);
  const $xValue = $xValueGroup.append('text').attr('class', 'focusValue').attr('x', 0).attr('y', 0);
  const yAxisWidth = $yAxis.node().getBBox().width;
  const $yValueGroup = $focus.append('g').attr('transform', `translate(${-1 * yAxisWidth}, 0)`);
  const $yValueRect = $yValueGroup.append('rect').attr('class', 'focusValueRect').attr('x', 0).attr('y', 0);
  const $yValue = $yValueGroup.append('text').attr('class', 'focusValue').attr('x', 0).attr('y', 0);
  $group.append('rect').attr('class', 'focusOverlay').attr('width', width).attr('height', height)
    .on('mouseover', () => {
      $focus.style('opacity', '1');
      $xLine.style('opacity', '1');
      $yLine.style('opacity', '1');
    })
    .on('mouseout', () => {
      $focus.style('opacity', '0');
      $xLine.style('opacity', '0');
      $yLine.style('opacity', '0');
    })
    .on('mousemove', () => {
      const [xCoordinate, yCoordinate] = d3.mouse($focus.node());
      const xDate = xDateScale.invert(xCoordinate);
      const i = bisectDate(data, xDate, 1);
      const dataItemPrev = data[i - 1];
      const dataItem = data[i];
      const coordinateData = xDate - dataItemPrev.date > dataItem.date - xDate ?
        dataItem :
        dataItemPrev;
      const {date, open, high, low, close } = coordinateData;

      $xValue.text(dateFormat(date));
      const { width: xValueWidth, height: xValueHeight } = $xValue.node().getBBox();
      const xRectWidth = xValueWidth + 12;
      const xRectHeight = xValueHeight + 8;
      $xValueGroup.attr('transform', `translate(${xCoordinate}, ${height + xRectHeight / 2})`);
      $xValueRect.attr('width', xRectWidth).attr('height', xRectHeight)
        .attr('transform', `translate(${-1 * xRectWidth / 2}, ${-1 * xRectHeight / 2})`);

      $yValue.text(valueFormat(isDayPeriod ? high : close));
      const { width: yValueWidth, height: yValueHeight } = $yValue.node().getBBox();
      const yRectWidth = yValueWidth + 12;
      const yRectHeight = yValueHeight + 8;
      $yValueGroup.attr('transform', `translate(${-1 * yRectWidth / 2}, ${yCoordinate})`);
      $yValueRect.attr('width', yRectWidth).attr('height', yRectHeight)
        .attr('transform', `translate(${-1 * yRectWidth / 2}, ${-1 * yRectHeight / 2})`);

      $xLine.attr('x1', xCoordinate).attr('x2', xCoordinate);
      $yLine.attr('y1', yCoordinate).attr('y2', yCoordinate);

      state.update('open', valueFormat(open));
      state.update('high', valueFormat(high));
      state.update('low', valueFormat(low));
      state.update('close', valueFormat(close));
    });
};
*/

const init = async () => {
  d3.timeFormatDefaultLocale(ruTimeLocale);
  const $title = d3.select('#chart__title');
  const $symbol = d3.select('#chart__symbol');
  const $open = d3.select('#chart__open');
  const $high = d3.select('#chart__high');
  const $low = d3.select('#chart__low');
  const $close = d3.select('#chart__close');
  const $container = d3.select('#chart__container');
  const $period = d3.select('#chart__period');
  const $type = d3.select('#chart__type');
  const state = new State({
    symbol: 'aapl',
    open: '-',
    high: '-',
    low: '-',
    close: '-',
    period: '3m',
    type: 'candle',
    stocksData: [],
  });
  const isPeriodOneDay = () => state.get('period') === '1d';
  const chart = new Chart({
    $container,
    requestStateUpdate: (nextState) => {
      Object.entries(nextState).forEach(([name, value]) =>
        state.update(name, value));
    },
  });
  chart.renderChart(isPeriodOneDay());
  listenRadioGroupChanges($symbol, function() {
    const { value } = this;
    state.update('symbol', value);
  }, state.get('symbol'));
  listenRadioGroupChanges($period, function() {
    const { value } = this;
    state.update('period', value);
  }, state.get('period'));
  listenRadioGroupChanges($type, function() {
    const { value } = this;
    state.update('type', value);
  }, state.get('type'));
  state.subscribe('symbol', async (value) => {
    $title.text(`График акций ${value.toUpperCase()}`);
    const period = state.get('period');
    const stocksData = await fetchStockData(value, period);
    stocksData && stocksData.length && state.update('stocksData', stocksData);
  });
  state.subscribe('period', async (value) => {
    const symbol = state.get('symbol');
    const stocksData = await fetchStockData(symbol, value);
    stocksData && stocksData.length && state.update('stocksData', stocksData);
  });
  state.subscribe('open', (value) => {
    $open.text(value);
  });
  state.subscribe('high', (value) => {
    $high.text(value);
  });
  state.subscribe('low', (value) => {
    $low.text(value);
  });
  state.subscribe('close', (value) => {
    $close.text(value);
  });
  state.subscribe('stocksData', (value) => {
    const type = state.get('type');
    const isDay = isPeriodOneDay();
    chart.updateData(value, isDay);
    type === 'line' ?
      chart.renderLine(isDay) :
      chart.renderCandle(isDay);
  });
  state.subscribe('type', (value) => {
    const isDay = isPeriodOneDay();
    value === 'line' ?
      chart.renderLine(isDay) :
      chart.renderCandle(isDay);
  });
  state.callAllSubscribers();
};

(async () => {
  try {
    await documentReady();
    await init();
  } catch (e) {
    console.warn(e);
  }
})();
