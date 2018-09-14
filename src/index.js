require('babel-polyfill');
const d3 = require('d3');
const ruTimeLocale = require('d3-time-format/locale/ru-RU');

// const TIntervals = { '1M': 'day', '3M': 'day', '6M': 'day', '1Y': 'week', '2Y': 'week', '4Y': 'month', };
// const TFormat = { 'day': '%d %b \'%y', 'week': '%d %b \'%y', 'month': '%b \'%y' };

const documentReady = () => new Promise((resolve) => {
  document.readyState === 'complete' ?
    resolve() :
    window.addEventListener('load', resolve, true);
});

const fetchStockData = async (symbol, period) => {
  if (!symbol || !period) {
    return null;
  }
  try {
    const url = `https://api.iextrading.com/1.0/stock/${symbol}/chart/${period}`;
    return await d3.json(url);
  } catch (e) {
    console.warn(e);
    return null;
  }
};

class State {
  constructor(initialState = {}) {
    this.state = initialState;
    this.subscribers = {};
  }
  get(name) {
    if (!name || !this.state.hasOwnProperty(name)) {
      return;
    }
    return this.state[name];
  }
  update(name, value) {
    if (!name || value === undefined || !this.state.hasOwnProperty(name)) {
      return;
    }
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
    if (!name || typeof subscriber !== 'function' || !this.state.hasOwnProperty(name)) {
      return;
    }
    if (!this.subscribers[name]) {
      this.subscribers[name] = [];
    }
    this.subscribers[name].push(subscriber);
  }
  callAllSubscribers() {
    Object.entries(this.subscribers).forEach(([name, subscribers]) => {
      const value = this.get(name);
      subscribers.forEach(subscriber => subscriber(value))
    });
  }
}

const listenRadioGroupChanges = ($d3Target, handler) => {
  if (!$d3Target || typeof handler !== 'function') {
    return;
  }
  $d3Target.selectAll('input[type=radio]').on('change', handler);
};

const renderLineChart = ($chart) => {
  $chart.on('mousemove', point).on('mouseover', over).on('mouseleave', leave);
  const margin = { top: 20, right: 20, bottom: 40, left: 40 };
  const width = +$chart.attr('width') - margin.left - margin.right;
  const height = +$chart.attr('height') - margin.top - margin.bottom;
  const $group = $chart.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
  const x = d3.scaleTime().rangeRound([0, width]);
  const y = d3.scaleLinear().rangeRound([height, 0]);
  const $line = d3.line().x(({ date }) => x(date)).y(({ close }) => y(close));
  const $path = $group.append('path');
  const $circle = $group.append('circle');
  $group.append("g").attr("class", "grid").attr("transform", "translate(0," + height + ")").call(d3.axisBottom(x).ticks(5).tickSize(-height).tickFormat(""));
  $group.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(""));
  $group.append('g').attr('transform', 'translate(0,' + height + ')').call(d3.axisBottom(x));
  $group.append('g').call(d3.axisLeft(y));
  function point() {
    const pathEl = $path.node();
    const pathLength = pathEl.getTotalLength();
    const _x = d3.mouse($group.node())[0];
    let beginning = _x;
    let end = pathLength;
    let target;
    let pos;
    while (true) {
      target = Math.floor((beginning + end) / 2);
      pos = pathEl.getPointAtLength(target);
      if ((target === end || target === beginning) && pos.x !== _x) {
        break;
      }
      if (pos.x > _x) {
        end = target;
      } else if (pos.x < _x) {
        beginning = target;
      } else {
        break;
      }
    }
    $circle.attr('opacity', 1).attr('cx', _x).attr('cy', pos.y);
  }
  function over() {
    $circle.transition().duration(200).style('opacity', '1');
  }
  function leave() {
    $circle.transition().duration(200).style('opacity', '0');
  }
  return {
    x,
    y,
    $line,
    $path,
    $circle,
  };
};

const renderLinePath = ({ x, y, $line, $path, $circle }, rawData) => {
  const data = rawData.map(item => {
    item.date = item.minute ?
      d3.timeParse('%Y%m%d %H:%M')(`${item.date} ${item.minute}`) :
      d3.timeParse('%Y-%m-%d')(item.date);
    return item;
  });
  x.domain([data[0].date, data[data.length - 1].date]);
  y.domain(d3.extent(data, ({ close }) => close));
  $path.datum(data)
    .attr('fill', 'none')
    .attr('stroke', 'steelblue')
    .attr('stroke-linejoin', 'round')
    .attr('stroke-linecap', 'round')
    .attr('stroke-width', 1.5)
    .attr('d', $line);
  $circle.attr('r', 7)
    .attr('fill', 'rgb(205,23,25)')
    .style('opacity', '0')
    .attr('pointer-events', 'none')
    .attr('stroke-width', '2.5')
    .attr('stroke', 'white');
};

const init = async () => {
  d3.timeFormatDefaultLocale(ruTimeLocale);
  const state = new State({
    symbol: 'aapl',
    open: '-',
    high: '-',
    low: '-',
    close: '-',
    period: '6m',
    type: 'line',
    stocksData: [],
  });
  const $title = d3.select('#chart__title');
  const $symbol = d3.select('#chart__symbol');
  const $open = d3.select('#chart__open');
  const $high = d3.select('#chart__high');
  const $low = d3.select('#chart__low');
  const $close = d3.select('#chart__close');
  const $container = d3.select('#chart__container');
  const $period = d3.select('#chart__period');
  const $type = d3.select('#chart__type');
  const chartMeta = renderLineChart($container);
  listenRadioGroupChanges($symbol, function() {
    const { value } = this;
    state.update('symbol', value);
  });
  listenRadioGroupChanges($period, function() {
    const { value } = this;
    state.update('period', value);
  });
  listenRadioGroupChanges($type, function() {
    const { value } = this;
    state.update('type', value);
  });
  state.subscribe('symbol', async (value) => {
    $title.text(`${value.toUpperCase()} график акций`);
    const period = state.get('period');
    const stocksData = await fetchStockData(value, period);
    state.update('stocksData', stocksData)
  });
  state.subscribe('period', async (value) => {
    const symbol = state.get('symbol');
    const stocksData = await fetchStockData(symbol, value);
    state.update('stocksData', stocksData)
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
    renderLinePath(chartMeta, value);
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

function displayAll() {
  displayCS();
  displayGen(genData.length - 1);
}

function displayCS() {
  var chart = cschart().Bheight(460);
  d3.select('#chart1').call(chart);
  var chart = barchart().mname('volume').margin(320).MValue('TURNOVER');
  d3.select('#chart1').datum(genData).call(chart);
  var chart = barchart().mname('sigma').margin(400).MValue('VOLATILITY');
  d3.select('#chart1').datum(genData).call(chart);
  hoverAll();
}

function hoverAll() {
  d3.select('#chart1').select('.bands').selectAll('rect')
  .on('mouseover', function(d, i) {
    d3.select(this).classed('hoved', true);
    d3.select('.stick' + i).classed('hoved', true);
    d3.select('.candle' + i).classed('hoved', true);
    d3.select('.volume' + i).classed('hoved', true);
    d3.select('.sigma' + i).classed('hoved', true);
    displayGen(i);
  })
  .on('mouseout', function(d, i) {
    d3.select(this).classed('hoved', false);
    d3.select('.stick' + i).classed('hoved', false);
    d3.select('.candle' + i).classed('hoved', false);
    d3.select('.volume' + i).classed('hoved', false);
    d3.select('.sigma' + i).classed('hoved', false);
    displayGen(genData.length - 1);
  });
}

function displayGen(mark) {
  var header = csheader();
  d3.select('#infobar').datum(genData.slice(mark)[0]).call(header);
}

function cschart() {

  var margin = { top: 0, right: 30, bottom: 40, left: 5 },
    width = 620, height = 300, Bheight = 460;

  function csrender(selection) {
    selection.each(function() {

      var interval = TIntervals[TPeriod];

      var minimal = d3.min(genData, function(d) {
        return d.LOW;
      });
      var maximal = d3.max(genData, function(d) {
        return d.HIGH;
      });

      var extRight = width + margin.right;
      var x = d3.scale.ordinal()
      .rangeBands([0, width]);

      var y = d3.scale.linear()
      .rangeRound([height, 0]);

      var xAxis = d3.svg.axis()
      .scale(x)
      .tickFormat(d3.time.format(TFormat[interval]));

      var yAxis = d3.svg.axis()
      .scale(y)
      .ticks(Math.floor(height / 50));

      x.domain(genData.map(function(d) {
        return d.TIMESTAMP;
      }));
      y.domain([minimal, maximal]).nice();

      var xtickdelta = Math.ceil(60 / (width / genData.length));
      xAxis.tickValues(x.domain().filter(function(d, i) {
        return !((i + Math.floor(xtickdelta / 2)) % xtickdelta);
      }));

      var barwidth = x.rangeBand();
      var candlewidth = Math.floor(d3.min([barwidth * 0.8, 13]) / 2) * 2 + 1;
      var delta = Math.round((barwidth - candlewidth) / 2);

      d3.select(this).select('svg').remove();
      var svg = d3.select(this).append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', Bheight + margin.top + margin.bottom)
      .append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

      svg.append('g')
      .attr('class', 'axis xaxis')
      .attr('transform', 'translate(0,' + height + ')')
      .call(xAxis.orient('bottom').outerTickSize(0));

      svg.append('g')
      .attr('class', 'axis yaxis')
      .attr('transform', 'translate(' + width + ',0)')
      .call(yAxis.orient('right').tickSize(0));

      svg.append('g')
      .attr('class', 'axis grid')
      .attr('transform', 'translate(' + width + ',0)')
      .call(yAxis.orient('left').tickFormat('').tickSize(width).outerTickSize(0));

      var bands = svg.selectAll('.bands')
      .data([genData])
      .enter().append('g')
      .attr('class', 'bands');

      bands.selectAll('rect')
      .data(function(d) {
        return d;
      })
      .enter().append('rect')
      .attr('x', function(d) {
        return x(d.TIMESTAMP) + Math.floor(barwidth / 2);
      })
      .attr('y', 0)
      .attr('height', Bheight)
      .attr('width', 1)
      .attr('class', function(d, i) {
        return 'band' + i;
      })
      .style('stroke-width', Math.floor(barwidth));

      var stick = svg.selectAll('.sticks')
      .data([genData])
      .enter().append('g')
      .attr('class', 'sticks');

      stick.selectAll('rect')
      .data(function(d) {
        return d;
      })
      .enter().append('rect')
      .attr('x', function(d) {
        return x(d.TIMESTAMP) + Math.floor(barwidth / 2);
      })
      .attr('y', function(d) {
        return y(d.HIGH);
      })
      .attr('class', function(d, i) {
        return 'stick' + i;
      })
      .attr('height', function(d) {
        return y(d.LOW) - y(d.HIGH);
      })
      .attr('width', 1)
      .classed('rise', function(d) {
        return (d.CLOSE > d.OPEN);
      })
      .classed('fall', function(d) {
        return (d.OPEN > d.CLOSE);
      });

      var candle = svg.selectAll('.candles')
      .data([genData])
      .enter().append('g')
      .attr('class', 'candles');

      candle.selectAll('rect')
      .data(function(d) {
        return d;
      })
      .enter().append('rect')
      .attr('x', function(d) {
        return x(d.TIMESTAMP) + delta;
      })
      .attr('y', function(d) {
        return y(d3.max([d.OPEN, d.CLOSE]));
      })
      .attr('class', function(d, i) {
        return 'candle' + i;
      })
      .attr('height', function(d) {
        return y(d3.min([d.OPEN, d.CLOSE])) - y(d3.max([d.OPEN, d.CLOSE]));
      })
      .attr('width', candlewidth)
      .classed('rise', function(d) {
        return (d.CLOSE > d.OPEN);
      })
      .classed('fall', function(d) {
        return (d.OPEN > d.CLOSE);
      });

    });
  } // csrender

  csrender.Bheight = function(value) {
    if (!arguments.length) return Bheight;
    Bheight = value;
    return csrender;
  };

  return csrender;
} // cschart

function barchart() {

  var margin = { top: 300, right: 30, bottom: 10, left: 5 },
    width = 620, height = 60, mname = 'mbar1';

  var MValue = 'TURNOVER';

  function barrender(selection) {
    selection.each(function(data) {

      var x = d3.scale.ordinal()
      .rangeBands([0, width]);

      var y = d3.scale.linear()
      .rangeRound([height, 0]);

      var xAxis = d3.svg.axis()
      .scale(x)
      .tickFormat(d3.time.format(TFormat[TIntervals[TPeriod]]));

      var yAxis = d3.svg.axis()
      .scale(y)
      .ticks(Math.floor(height / 50));

      var svg = d3.select(this).select('svg')
      .append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

      x.domain(data.map(function(d) {
        return d.TIMESTAMP;
      }));
      y.domain([0, d3.max(data, function(d) {
        return d[MValue];
      })]).nice();

      var xtickdelta = Math.ceil(60 / (width / data.length));
      xAxis.tickValues(x.domain().filter(function(d, i) {
        return !((i + Math.floor(xtickdelta / 2)) % xtickdelta);
      }));

      svg.append('g')
      .attr('class', 'axis yaxis')
      .attr('transform', 'translate(' + width + ',0)')
      .call(yAxis.orient('right').tickFormat('').tickSize(0));

//      svg.append("g")
//          .attr("class", "axis yaxis")
//          .attr("transform", "translate(0,0)")
//          .call(yAxis.orient("left"));

      var barwidth = x.rangeBand();
      var fillwidth = (Math.floor(barwidth * 0.9) / 2) * 2 + 1;
      var bardelta = Math.round((barwidth - fillwidth) / 2);

      var mbar = svg.selectAll('.' + mname + 'bar')
      .data([data])
      .enter().append('g')
      .attr('class', mname + 'bar');

      mbar.selectAll('rect')
      .data(function(d) {
        return d;
      })
      .enter().append('rect')
      .attr('class', mname + 'fill')
      .attr('x', function(d) {
        return x(d.TIMESTAMP) + bardelta;
      })
      .attr('y', function(d) {
        return y(d[MValue]);
      })
      .attr('class', function(d, i) {
        return mname + i;
      })
      .attr('height', function(d) {
        return y(0) - y(d[MValue]);
      })
      .attr('width', fillwidth);
    });
  } // barrender
  barrender.mname = function(value) {
    if (!arguments.length) return mname;
    mname = value;
    return barrender;
  };

  barrender.margin = function(value) {
    if (!arguments.length) return margin.top;
    margin.top = value;
    return barrender;
  };

  barrender.MValue = function(value) {
    if (!arguments.length) return MValue;
    MValue = value;
    return barrender;
  };

  return barrender;
} // barchart

function csheader() {

  function cshrender(selection) {
    selection.each(function(data) {

      var interval = TIntervals[TPeriod];
      var format = (interval == 'month') ? d3.time.format('%b %Y') : d3.time.format('%b %d %Y');
      var dateprefix = (interval == 'month') ? 'Month of ' : (interval == 'week') ? 'Week of ' : '';
      d3.select('#infodate').text(dateprefix + format(data.TIMESTAMP));
      d3.select('#infoopen').text('O ' + data.OPEN);
      d3.select('#infohigh').text('H ' + data.HIGH);
      d3.select('#infolow').text('L ' + data.LOW);
      d3.select('#infoclose').text('C ' + data.CLOSE);

    });
  } // cshrender

  return cshrender;
} // csheader

