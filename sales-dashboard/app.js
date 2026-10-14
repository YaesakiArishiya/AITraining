/* ============================================================
 * 销售看板页（index.html）的渲染逻辑
 * 数据全部来自共享数据层 data.js（window.StoreData），
 * 本文件只负责把数据画成界面。
 * ========================================================== */
(function () {
  'use strict';

  var D = window.StoreData;

  // 从共享数据层取用的门店配置与工具函数
  var STORE = D.STORE;
  var isOpenDay = D.isOpenDay;
  var getDay = D.getDay;
  var sliceTo = D.sliceTo;
  var toKey = D.toKey;
  var fromKey = D.fromKey;
  var shiftDays = D.shiftDays;
  var money = D.money;
  var num = D.num;
  var pct = D.pct;
  var weekdayName = D.weekdayName;

  /* ---------------- 5. 渲染 ---------------- */

  var state = { key: toKey(new Date()), metric: 'sales' };
  var currentView = null;   // 当前展示（可能被截断）
  var prevView = null;      // 用于环比

  var el = {
    datePicker: document.getElementById('datePicker'),
    statusBar: document.getElementById('statusBar'),
    kpis: document.getElementById('kpis'),
    chart: document.getElementById('hourChart'),
    chartSub: document.getElementById('chartSub'),
    tabs: document.getElementById('metricTabs'),
    payment: document.getElementById('paymentWrap'),
    category: document.getElementById('categoryList'),
    products: document.getElementById('productTable')
  };

  var tip = document.createElement('div');
  tip.className = 'chart-tip';
  document.body.appendChild(tip);

  function metricValue(h, metric) {
    if (metric === 'sales') return h.sales;
    if (metric === 'orders') return h.orders;
    return h.orders ? h.sales / h.orders : 0;
  }

  function metricFormat(v, metric) {
    if (metric === 'orders') return num(v) + ' 单';
    return '¥' + num(v);
  }

  function deltaChip(cur, prev, label, invert) {
    if (!prev) return '<div class="meta">' + label + '</div>';
    var diff = (cur - prev) / prev;
    var good = invert ? diff < -0.0005 : diff > 0.0005;
    var bad = invert ? diff > 0.0005 : diff < -0.0005;
    var cls = good ? 'up' : (bad ? 'down' : 'flat');
    var arrow = diff > 0.0005 ? '▲' : (diff < -0.0005 ? '▼' : '—');
    return '<div class="meta"><span class="delta ' + cls + '">' + arrow + ' ' +
      Math.abs(diff * 100).toFixed(1) + '%</span><span>' + label + '</span></div>';
  }

  function renderStatus(view, isToday) {
    var parts = [];
    parts.push('<strong>' + view.key + '</strong>');
    parts.push(weekdayName(view.date));
    parts.push('营业 ' + (STORE.openHour < 10 ? '0' : '') + STORE.openHour + ':00–' +
      (STORE.closeHour < 10 ? '0' : '') + STORE.closeHour + ':00');

    if (isToday) {
      var now = new Date();
      var hh = (now.getHours() < 10 ? '0' : '') + now.getHours();
      var mm = (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();
      parts.push('数据截至 ' + hh + ':' + mm);
      el.statusBar.innerHTML = parts.join('<span class="dot">·</span>') +
        '<span class="pill live">进行中</span>';
    } else {
      parts.push('全天数据');
      if (view.firstOrderHour !== undefined) {
        parts.push('首单 ' + view.firstOrderHour + ':00 前后');
      }
      el.statusBar.innerHTML = parts.join('<span class="dot">·</span>');
    }
  }

  function renderKpis(view, prev) {
    var cards = [
      {
        label: '当日销售额', value: money(view.totalSales),
        foot: '净销售 ' + money(view.netSales), compare: view.totalSales, prev: prev && prev.totalSales
      },
      {
        label: '订单数', value: num(view.orders) + '<span class="unit">单</span>',
        foot: null, compare: view.orders, prev: prev && prev.orders
      },
      {
        label: '客单价', value: money(view.aov),
        foot: null, compare: view.aov, prev: prev && prev.aov
      },
      {
        label: '售出商品', value: num(view.items) + '<span class="unit">件</span>',
        foot: '平均每单 ' + (view.orders ? (view.items / view.orders).toFixed(1) : '0') + ' 件',
        compare: view.items, prev: prev && prev.items
      },
      {
        label: '退款', value: money(view.refundAmount),
        foot: view.refundCount + ' 笔退单',
        compare: view.refundAmount, prev: prev && prev.refundAmount, invert: true
      }
    ];

    el.kpis.innerHTML = cards.map(function (c) {
      return '<div class="kpi">' +
        '<div class="label">' + c.label + '</div>' +
        '<div class="value">' + c.value + '</div>' +
        deltaChip(c.compare, c.prev, state.compareLabel, c.invert) +
        (c.foot ? '<div class="meta">' + c.foot + '</div>' : '') +
        '</div>';
    }).join('');
  }

  function renderChart(view) {
    var metric = state.metric;
    var all = view.hourly.filter(function (h) { return h.orders > 0 || h.sales > 0; });
    var max = all.reduce(function (m, h) { return Math.max(m, metricValue(h, metric)); }, 0) || 1;

    // 高峰时段按当前所选指标判定
    var best = all.reduce(function (a, b) {
      return !a || metricValue(b, metric) > metricValue(a, metric) ? b : a;
    }, null);
    var peakHour = best ? best.hour : -1;

    var byHour = {};
    view.hourly.forEach(function (h) { byHour[h.hour] = h; });

    var bars = '';
    var axis = '';
    for (var hh = 0; hh < 24; hh++) {
      var h = byHour[hh];
      var v = h ? metricValue(h, metric) : 0;
      var height = v > 0 ? Math.max((v / max) * 100, 1.5) : 0;
      var isPeak = h && v > 0 && h.hour === peakHour;
      bars += '<div class="col' + (isPeak ? ' is-peak' : '') + '"' +
        ' data-hour="' + hh + '"' +
        ' data-sales="' + (h ? h.sales : 0) + '"' +
        ' data-orders="' + (h ? h.orders : 0) + '">' +
        '<div class="bar" style="height:' + height.toFixed(2) + '%"></div>' +
        '</div>';
      axis += '<span>' + (hh % 2 === 0 ? (hh < 10 ? '0' + hh : hh) : '') + '</span>';
    }

    el.chart.innerHTML = '<div class="bars">' + bars + '</div><div class="xaxis">' + axis + '</div>';

    var labels = { sales: '按小时统计销售额', orders: '按小时统计订单量', aov: '按小时统计客单价' };
    var peakText = best
      ? '　·　高峰时段 ' + (peakHour < 10 ? '0' + peakHour : peakHour) + ':00–' +
        ((peakHour + 1) < 10 ? '0' + (peakHour + 1) : (peakHour + 1)) + ':00（' +
        metricFormat(metricValue(best, metric), metric) + '）'
      : '';
    el.chartSub.textContent = labels[metric] + peakText;

    // 悬停提示
    Array.prototype.forEach.call(el.chart.querySelectorAll('.col'), function (col) {
      col.addEventListener('mousemove', function (e) {
        var hh = +col.dataset.hour;
        var sales = +col.dataset.sales;
        var orders = +col.dataset.orders;
        if (!sales && !orders) {
          tip.classList.remove('show');
          return;
        }
        tip.innerHTML = '<b>' + (hh < 10 ? '0' + hh : hh) + ':00–' +
          ((hh + 1) < 10 ? '0' + (hh + 1) : (hh + 1)) + ':00</b><br>' +
          '销售额 ' + money(sales) + '<br>' +
          '订单 ' + orders + ' 单' + (orders ? '　客单价 ' + money(sales / orders) : '');
        tip.style.left = e.clientX + 'px';
        tip.style.top = (e.clientY - 12) + 'px';
        tip.classList.add('show');
      });
      col.addEventListener('mouseleave', function () { tip.classList.remove('show'); });
    });
  }

  function renderPayments(view) {
    if (!view.payments.length) {
      el.payment.innerHTML = '<div class="empty">暂无数据</div>';
      return;
    }
    var total = view.payments.reduce(function (s, p) { return s + p.sales; }, 0) || 1;
    var acc = 0;
    var stops = view.payments.map(function (p) {
      var start = acc;
      acc += (p.sales / total) * 100;
      return p.color + ' ' + start.toFixed(2) + '% ' + acc.toFixed(2) + '%';
    });

    var legend = view.payments.map(function (p) {
      return '<div class="legend-row">' +
        '<i class="legend-swatch" style="background:' + p.color + '"></i>' +
        '<span class="name">' + p.name + '</span>' +
        '<span class="val">' + money(p.sales) + '</span>' +
        '<span class="pct">' + pct(p.sales / total) + '</span>' +
        '</div>';
    }).join('');

    el.payment.innerHTML =
      '<div class="donut" style="background:conic-gradient(' + stops.join(',') + ')">' +
        '<div class="donut-center"><div class="n">' + num(view.orders) + '</div><div class="t">订单</div></div>' +
      '</div>' +
      '<div class="legend">' + legend + '</div>';
  }

  function renderCategories(view) {
    if (!view.categories.length) {
      el.category.innerHTML = '<div class="empty">暂无数据</div>';
      return;
    }
    var list = view.categories.slice().sort(function (a, b) { return b.sales - a.sales; });
    var total = list.reduce(function (s, c) { return s + c.sales; }, 0) || 1;
    var max = list[0].sales || 1;

    el.category.innerHTML = list.map(function (c) {
      var share = c.sales / total;
      return '<div class="cat-row">' +
        '<div class="top">' +
          '<span class="name">' + c.name + '</span>' +
          '<span class="amount">' + money(c.sales) + '<span>' + pct(share) + ' · ' + num(c.qty) + ' 件</span></span>' +
        '</div>' +
        '<div class="track"><i style="width:' + Math.max((c.sales / max) * 100, 2).toFixed(1) + '%"></i></div>' +
        '</div>';
    }).join('');
  }

  function renderProducts(view) {
    if (!view.products.length) {
      el.products.innerHTML = '<div class="empty">暂无数据</div>';
      return;
    }
    var top = view.products.slice(0, 10);
    var max = top[0].sales || 1;
    var total = view.products.reduce(function (s, p) { return s + p.sales; }, 0) || 1;

    var rows = top.map(function (p, i) {
      return '<tr>' +
        '<td><span class="rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span></td>' +
        '<td><div class="pname">' + p.name + '</div></td>' +
        '<td><span class="tag">' + p.cat + '</span></td>' +
        '<td class="num">' + money(p.price) + '</td>' +
        '<td class="num">' + num(p.qty) + '</td>' +
        '<td class="num">' + money(p.sales) + '</td>' +
        '<td class="num share-col"><div class="share-cell"><div class="track"><i style="width:' +
          Math.max((p.sales / max) * 100, 2).toFixed(1) + '%"></i></div><span>' +
          pct(p.sales / total) + '</span></div></td>' +
        '</tr>';
    }).join('');

    el.products.innerHTML =
      '<table><thead><tr>' +
        '<th>#</th><th>商品</th><th>品类</th><th class="num">单价</th>' +
        '<th class="num">销量</th><th class="num">销售额</th><th class="num share-col">占比</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function renderEmpty(message) {
    el.kpis.innerHTML = '<div class="kpi"><div class="label">当日销售额</div><div class="value">—</div><div class="meta">' + message + '</div></div>';
    el.chart.innerHTML = '<div class="empty">' + message + '</div>';
    el.payment.innerHTML = '<div class="empty">暂无数据</div>';
    el.category.innerHTML = '<div class="empty">暂无数据</div>';
    el.products.innerHTML = '<div class="empty">暂无数据</div>';
  }

  /* ---------------- 6. 主流程 ---------------- */

  function render() {
    var todayKey = toKey(new Date());
    var isToday = state.key === todayKey;
    var isFuture = state.key > todayKey;

    el.datePicker.value = state.key;

    if (isFuture) {
      currentView = null;
      el.statusBar.innerHTML = '<strong>' + state.key + '</strong>' +
        '<span class="dot">·</span>' + weekdayName(fromKey(state.key)) +
        '<span class="dot">·</span>该日期尚未发生';
      renderEmpty('所选日期在未来，暂无数据');
      return;
    }

    // 开业之前没有任何经营数据
    if (!isOpenDay(state.key)) {
      currentView = null;
      el.statusBar.innerHTML = '<strong>' + state.key + '</strong>' +
        '<span class="dot">·</span>' + weekdayName(fromKey(state.key)) +
        '<span class="dot">·</span>店铺尚未开业（' + STORE.openDate + ' 开业）';
      renderEmpty('该日期早于开业时间（' + STORE.openDate + '），暂无数据');
      return;
    }

    var full = getDay(state.key);
    var nowHour = new Date().getHours();

    if (isToday) {
      // 营业前：显示空数据；营业中：只统计到当前小时
      currentView = nowHour < STORE.openHour ? sliceTo(full, -1) : sliceTo(full, nowHour);
    } else {
      currentView = full;
      currentView.key = state.key;
      currentView.partial = false;
    }

    // 环比：今天与「昨天同一时段」对比，历史日期则整天对整天
    // 开业首日没有前一天的数据，此时不做环比
    var prevKey = toKey(shiftDays(fromKey(state.key), -1));
    if (isOpenDay(prevKey)) {
      var prevFull = getDay(prevKey);
      if (isToday) {
        var cut = currentView.hourly.length ? currentView.hourly[currentView.hourly.length - 1].hour : -1;
        prevView = sliceTo(prevFull, cut);
      } else {
        prevView = prevFull;
      }
      state.compareLabel = isToday ? '较昨日同时段' : '较前一日';
    } else {
      prevView = null;
      state.compareLabel = '开业首日，无对比数据';
    }

    renderStatus(currentView, isToday);
    renderKpis(currentView, prevView);
    renderChart(currentView);
    renderPayments(currentView);
    renderCategories(currentView);
    renderProducts(currentView);
  }

  function setDate(delta) {
    state.key = toKey(shiftDays(fromKey(state.key), delta));
    render();
  }

  /* ---------------- 7. 事件绑定 ---------------- */

  el.datePicker.value = state.key;
  el.datePicker.max = toKey(new Date());
  el.datePicker.min = STORE.openDate;

  el.datePicker.addEventListener('change', function () {
    if (!el.datePicker.value) return;
    state.key = el.datePicker.value;
    render();
  });
  document.getElementById('prevDay').addEventListener('click', function () { setDate(-1); });
  document.getElementById('nextDay').addEventListener('click', function () { setDate(1); });
  document.getElementById('todayBtn').addEventListener('click', function () {
    state.key = toKey(new Date());
    render();
  });

  el.tabs.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-metric]');
    if (!btn) return;
    state.metric = btn.dataset.metric;
    Array.prototype.forEach.call(el.tabs.querySelectorAll('button'), function (b) {
      b.classList.toggle('active', b === btn);
    });
    if (currentView) renderChart(currentView);
  });

  // 营业时间内每分钟自动刷新（跨小时后视图自动推进）
  setInterval(function () {
    if (state.key === toKey(new Date())) render();
  }, 60 * 1000);

  render();
})();
