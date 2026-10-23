/* ============================================================
 * 员工工时页（staff.html）的渲染逻辑
 * 数据来自共享数据层 data.js（window.StoreData）。
 *
 * 统计口径：一个自然月为一个周期。
 *   上班时间 / 下班时间 = 打卡时间（相对排班有少量浮动）
 *   工时 = 下班 − 上班 − 休息时长
 *   月度工时 = 该员工当月所有出勤日的工时之和
 * 本月还在进行时，只统计到今天，且今天的班次按「已工作时间」计入。
 * ========================================================== */
(function () {
  'use strict';

  var D = window.StoreData;

  var EMPLOYEES = D.EMPLOYEES;
  var STANDARD_MONTH_HOURS = D.STANDARD_MONTH_HOURS;
  var money = D.money;
  var num = D.num;
  var pct = D.pct;
  var toKey = D.toKey;
  var fromKey = D.fromKey;
  var shiftDays = D.shiftDays;
  var weekdayName = D.weekdayName;
  var fmtClock = D.fmtClock;
  var fmtHours = D.fmtHours;

  var state = {
    ym: D.ymOf(new Date()),
    selected: EMPLOYEES[0].id
  };

  var el = {
    monthPicker: document.getElementById('monthPicker'),
    statusBar: document.getElementById('statusBar'),
    kpis: document.getElementById('kpis'),
    dayChart: document.getElementById('dayChart'),
    dayChartSub: document.getElementById('dayChartSub'),
    roleList: document.getElementById('roleList'),
    staffTable: document.getElementById('staffTable'),
    detailCard: document.getElementById('detailCard')
  };

  var tip = document.createElement('div');
  tip.className = 'chart-tip';
  document.body.appendChild(tip);

  /* ---------------- 工具 ---------------- */

  function daysInMonth(ym) {
    return new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
  }

  // 本月的统计范围：本月进行中则只到今天
  function currentPeriod() {
    var today = new Date();
    var isCurrent = state.ym === D.ymOf(today);
    return {
      isCurrent: isCurrent,
      lastDay: isCurrent ? today.getDate() : daysInMonth(state.ym),
      asOf: isCurrent ? today.getDate() : null
    };
  }

  // 上个月的同一段区间，用于环比；开业之前没有可比数据
  function prevPeriod() {
    var d = fromKey(state.ym + '-01');
    d.setMonth(d.getMonth() - 1);
    var ym = D.ymOf(d);
    if (!D.isOpenMonth(ym)) return null;
    var dim = daysInMonth(ym);
    var lastDay = Math.min(currentPeriod().lastDay, dim);
    return { ym: ym, lastDay: lastDay, asOf: lastDay === dim ? null : lastDay };
  }

  // 区间内的销售额：过去的日子取全天，今天只取到当前小时
  function periodSales(month) {
    var todayKey = toKey(new Date());
    var nowHour = new Date().getHours();
    return month.days.reduce(function (sum, d) {
      var day = D.getDay(d.dateKey);
      if (d.dateKey === todayKey) return sum + D.sliceTo(day, nowHour).totalSales;
      return sum + day.totalSales;
    }, 0);
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

  // 单日工时 → 热力图色深
  function heatColor(item) {
    if (item.kind === 'leave') return '#fecaca';
    if (item.kind !== 'work') return '#eceef3';
    var h = item.hours;
    if (h <= 4.5) return '#c7d2fe';
    if (h <= 6.5) return '#a5b4fc';
    if (h <= 8.5) return '#818cf8';
    return '#4f46e5';
  }

  function dayTitle(item) {
    var head = item.dateKey + ' ' + weekdayName(fromKey(item.dateKey));
    if (item.kind !== 'work') return head + '　' + item.status;
    var r = item.rec;
    return head + '　' + r.shiftName +
      '　上班 ' + fmtClock(r.inMin) +
      '　下班 ' + (r.outMin === null ? '—（进行中）' : fmtClock(r.outMin)) +
      '　休息 ' + r.breakMin + ' 分' +
      '　工时 ' + fmtHours(r.hours) + 'h　' + r.status;
  }

  function statusTag(item) {
    if (item.kind === 'rest') return '<span class="tag dim">休息</span>';
    if (item.kind === 'leave') return '<span class="tag warn">请假</span>';
    if (item.kind === 'idle') return '<span class="tag dim">未开始</span>';
    var r = item.rec;
    if (r.ongoing) return '<span class="tag live">进行中</span>';
    var tags = [];
    r.tags.forEach(function (t) {
      tags.push('<span class="tag ' +
        (t === '迟到' ? 'warn' : t === '早退' ? 'bad' : 'info') + '">' + t + '</span>');
    });
    if (!tags.length) tags.push('<span class="tag ok">正常</span>');
    return tags.join(' ');
  }

  /* ---------------- 渲染 ---------------- */

  function renderStatus(month, per) {
    var parts = [];
    parts.push('<strong>' + month.year + ' 年 ' + month.month + ' 月</strong>');
    var range = month.month + '/' + D.pad2(1) + '–' + month.month + '/' + D.pad2(month.lastDay);
    parts.push('统计周期 ' + range + '（' + month.lastDay + ' 天）');
    parts.push('员工 ' + EMPLOYEES.length + ' 人 · 已出勤 ' + month.activeStaff + ' 人');

    if (per.isCurrent) {
      parts.push('本月进行中');
      el.statusBar.innerHTML = parts.join('<span class="dot">·</span>') +
        '<span class="pill live">统计中</span>';
    } else {
      el.statusBar.innerHTML = parts.join('<span class="dot">·</span>');
    }
  }

  function renderKpis(month, prev, sales, prevSales) {
    var efficiency = month.totalHours ? sales / month.totalHours : 0;
    var prevEfficiency = prev && prev.totalHours ? prevSales / prev.totalHours : 0;

    var cards = [
      {
        label: '本月总工时', value: fmtHours(month.totalHours) + '<span class="unit">小时</span>',
        foot: '人均 ' + fmtHours(month.avgPerStaff) + ' 小时',
        compare: month.totalHours, prev: prev && prev.totalHours
      },
      {
        label: '出勤人次', value: num(month.personTimes) + '<span class="unit">人次</span>',
        foot: '日均在岗 ' + month.avgOnDuty.toFixed(1) + ' 人',
        compare: month.personTimes, prev: prev && prev.personTimes
      },
      {
        label: '日均工时', value: fmtHours(month.avgDailyHours) + '<span class="unit">小时/天</span>',
        foot: '全店每天投入的工时',
        compare: month.avgDailyHours, prev: prev && prev.avgDailyHours
      },
      {
        label: '加班总时长', value: fmtHours(month.overtimeHours) + '<span class="unit">小时</span>',
        foot: '迟到 ' + month.lateCount + ' 次 · 早退 ' + month.earlyLeaveCount + ' 次',
        compare: month.overtimeHours, prev: prev && prev.overtimeHours, invert: true
      },
      {
        label: '每小时人效', value: money(efficiency) + '<span class="unit">/小时</span>',
        foot: '同期销售额 ' + money(sales),
        compare: efficiency, prev: prevEfficiency
      }
    ];

    el.kpis.innerHTML = cards.map(function (c) {
      return '<div class="kpi">' +
        '<div class="label">' + c.label + '</div>' +
        '<div class="value">' + c.value + '</div>' +
        deltaChip(c.compare, c.prev, state.compareLabel, c.invert) +
        '<div class="meta">' + c.foot + '</div>' +
        '</div>';
    }).join('');
  }

  function renderDayChart(month) {
    var days = month.days;
    var max = days.reduce(function (m, d) { return Math.max(m, d.hours); }, 0) || 1;
    var peak = days.reduce(function (a, b) { return b.hours > a.hours ? b : a; }, days[0]);

    var bars = '';
    var axis = '';
    days.forEach(function (d) {
      var height = d.hours > 0 ? Math.max((d.hours / max) * 100, 2) : 0;
      bars += '<div class="col' + (d === peak ? ' is-peak' : '') + '"' +
        ' data-day="' + d.day + '">' +
        '<div class="bar" style="height:' + height.toFixed(2) + '%"></div>' +
        '</div>';
      axis += '<span>' + (d.day % 5 === 0 || d.day === 1 ? d.day : '') + '</span>';
    });

    el.dayChart.innerHTML = '<div class="bars">' + bars + '</div><div class="xaxis">' + axis + '</div>';
    el.dayChartSub.textContent = '按天统计全店打卡工时　·　工时最高 ' + peak.day + ' 日（' +
      fmtHours(peak.hours) + ' 小时 · ' + peak.onDutyCount + ' 人在岗）';

    Array.prototype.forEach.call(el.dayChart.querySelectorAll('.col'), function (col) {
      col.addEventListener('mousemove', function (e) {
        var d = days[+col.dataset.day - 1];
        if (!d) return;
        if (d.hours === 0) {
          tip.classList.remove('show');
          return;
        }
        tip.innerHTML = '<b>' + d.dateKey + ' ' + weekdayName(fromKey(d.dateKey)) + '</b><br>' +
          '总工时 ' + fmtHours(d.hours) + ' 小时　在岗 ' + d.onDutyCount + ' 人<br>' +
          (d.onDuty.join('、') || '—');
        tip.style.left = e.clientX + 'px';
        tip.style.top = (e.clientY - 12) + 'px';
        tip.classList.add('show');
      });
      col.addEventListener('mouseleave', function () { tip.classList.remove('show'); });
    });
  }

  function renderRoles(month) {
    var list = month.byRole;
    if (!list.length) {
      el.roleList.innerHTML = '<div class="empty">暂无数据</div>';
      return;
    }
    var total = list.reduce(function (s, r) { return s + r.hours; }, 0) || 1;
    var max = list[0].hours || 1;

    el.roleList.innerHTML = list.map(function (r) {
      return '<div class="cat-row">' +
        '<div class="top">' +
          '<span class="name">' + r.role + '</span>' +
          '<span class="amount">' + fmtHours(r.hours) + ' h<span>' + pct(r.hours / total) +
            ' · ' + r.staffCount + ' 人 · ' + r.workDays + ' 人次</span></span>' +
        '</div>' +
        '<div class="track"><i style="width:' + Math.max((r.hours / max) * 100, 2).toFixed(1) + '%"></i></div>' +
        '</div>';
    }).join('');
  }

  function renderStaffTable(month) {
    var staff = month.staff.slice().sort(function (a, b) { return b.totalHours - a.totalHours; });

    var rows = staff.map(function (s) {
      var spark = s.daily.map(function (item) {
        return '<i class="spark-cell" style="background:' + heatColor(item) + '"' +
          (item.ongoing ? ' data-ongoing="1"' : '') +
          ' title="' + dayTitle(item) + '"></i>';
      }).join('');

      var achieve = s.type === '全职'
        ? '<div class="achieve">' +
            '<div class="track sm"><i style="width:' +
              Math.min(s.achievement * 100, 100).toFixed(1) + '%"></i></div>' +
            '<span class="muted">达成 ' + Math.round(s.achievement * 100) + '%</span>' +
          '</div>'
        : '<span class="muted">兼职排班<br>每周约 3 天</span>';

      var issues = [];
      if (s.lateCount) issues.push('<span class="tag warn">迟到 ' + s.lateCount + '</span>');
      if (s.earlyLeaveCount) issues.push('<span class="tag bad">早退 ' + s.earlyLeaveCount + '</span>');
      if (!issues.length) issues.push('<span class="muted">—</span>');

      return '<tr class="staff-row' + (s.id === state.selected ? ' is-selected' : '') +
        '" data-emp="' + s.id + '">' +
        '<td><div class="emp">' +
          '<span class="avatar">' + s.name.charAt(0) + '</span>' +
          '<div><div class="emp-name">' + s.name +
            (s.ongoingToday ? '<span class="dot-live" title="今天正在上班"></span>' : '') + '</div>' +
            '<div class="muted">' + s.role + '</div></div>' +
        '</div></td>' +
        '<td class="col-sm-hide"><span class="tag' + (s.type === '兼职' ? ' info' : '') + '">' + s.type + '</span></td>' +
        '<td class="num">' + s.workDays + '<span class="muted"> 天</span></td>' +
        '<td class="num"><b>' + fmtHours(s.totalHours) + '</b><span class="muted"> h</span></td>' +
        '<td class="num col-sm-hide">' + fmtHours(s.avgHours) + '<span class="muted"> h</span></td>' +
        '<td class="num col-sm-hide">' + (s.overtimeHours ? fmtHours(s.overtimeHours) + '<span class="muted"> h</span>' : '<span class="muted">—</span>') + '</td>' +
        '<td class="num col-sm-hide">' + issues.join(' ') + '</td>' +
        '<td class="spark-col"><div class="spark">' + spark + '</div></td>' +
        '<td>' + achieve + '</td>' +
        '</tr>';
    }).join('');

    el.staffTable.innerHTML =
      '<table class="staff-table"><thead><tr>' +
        '<th>员工</th><th class="col-sm-hide">类型</th><th class="num">出勤</th><th class="num">总工时</th>' +
        '<th class="num col-sm-hide">日均</th><th class="num col-sm-hide">加班</th>' +
        '<th class="num col-sm-hide">异常</th>' +
        '<th class="spark-col">出勤分布</th><th>工时达成</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';

    Array.prototype.forEach.call(el.staffTable.querySelectorAll('.staff-row'), function (row) {
      row.addEventListener('click', function () {
        state.selected = row.dataset.emp;
        renderStaffTable(month);
        renderDetail(month);
      });
    });
  }

  function renderDetail(month) {
    var s = month.staff.filter(function (x) { return x.id === state.selected; })[0] || month.staff[0];
    if (!s) {
      el.detailCard.innerHTML = '<div class="empty">暂无数据</div>';
      return;
    }

    var rows = s.daily.map(function (item) {
      var r = item.rec;
      return '<tr class="' + (item.isToday ? 'is-today ' : '') + (item.kind === 'work' ? '' : 'muted-row') + '">' +
        '<td>' + item.dateKey + (item.isToday ? '<span class="tag live">今天</span>' : '') + '</td>' +
        '<td class="col-sm-hide">' + weekdayName(fromKey(item.dateKey)) + '</td>' +
        '<td>' + (r ? r.shiftName : '<span class="muted">—</span>') + '</td>' +
        '<td class="num">' + (r ? fmtClock(r.inMin) : '<span class="muted">—</span>') + '</td>' +
        '<td class="num">' + (r ? (r.outMin === null ? '<span class="muted">进行中</span>' : fmtClock(r.outMin)) : '<span class="muted">—</span>') + '</td>' +
        '<td class="num col-sm-hide">' + (r && r.breakMin ? r.breakMin + '<span class="muted"> 分</span>' : '<span class="muted">—</span>') + '</td>' +
        '<td class="num">' + (r ? '<b>' + fmtHours(r.hours) + '</b><span class="muted"> h</span>' : '<span class="muted">—</span>') + '</td>' +
        '<td>' + statusTag(item) + '</td>' +
        '</tr>';
    }).join('');

    var legend = '<div class="heat-legend">' +
      '<span><i class="spark-cell" style="background:#eceef3"></i>休息</span>' +
      '<span><i class="spark-cell" style="background:#c7d2fe"></i>≤4.5h</span>' +
      '<span><i class="spark-cell" style="background:#a5b4fc"></i>≤6.5h</span>' +
      '<span><i class="spark-cell" style="background:#818cf8"></i>≤8.5h</span>' +
      '<span><i class="spark-cell" style="background:#4f46e5"></i>&gt;8.5h</span>' +
      '<span><i class="spark-cell" style="background:#fecaca"></i>请假</span>' +
      '</div>';

    el.detailCard.innerHTML =
      '<div class="card-head">' +
        '<div class="emp">' +
          '<span class="avatar lg">' + s.name.charAt(0) + '</span>' +
          '<div>' +
            '<h2>' + s.name + ' <span class="tag">' + s.role + '</span>' +
              ' <span class="tag' + (s.type === '兼职' ? ' info' : '') + '">' + s.type + '</span></h2>' +
            '<p class="muted">' + month.year + ' 年 ' + month.month + ' 月　出勤 ' + s.workDays +
              ' 天　总工时 <b>' + fmtHours(s.totalHours) + ' 小时</b>　日均 ' + fmtHours(s.avgHours) +
              ' 小时　加班 ' + fmtHours(s.overtimeHours) + ' 小时' +
              (s.leaveDays ? '　请假 ' + s.leaveDays + ' 天' : '') +
              (s.ongoingToday ? '　（今天在岗）' : '') + '</p>' +
          '</div>' +
        '</div>' +
        legend +
      '</div>' +
      '<div class="table-wrap"><table class="detail-table"><thead><tr>' +
        '<th>日期</th><th class="col-sm-hide">星期</th><th>班次</th><th class="num">上班时间</th><th class="num">下班时间</th>' +
        '<th class="num col-sm-hide">休息</th><th class="num">工时</th><th>状态</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="muted detail-note">' +
        (s.type === '全职'
          ? '月度工时参考值 ' + fmtHours(s.referenceHours) + ' 小时（' +
            (month.partial ? '整月 174 小时按本月天数等比折算' : '21.75 天 × 8 小时') +
            '），当前达成 ' + Math.round(s.achievement * 100) + '%。'
          : '兼职员工按每周排班出勤，不参与标准月工时考核。') +
        ' 当日工时已扣除休息时间，进行中的班次按已工作时长等比扣除。' +
      '</p>';
  }

  function renderEmpty(message) {
    el.statusBar.innerHTML = '<strong>' + state.ym + '</strong>' +
      '<span class="dot">·</span>' + message;
    el.kpis.innerHTML = '<div class="kpi"><div class="label">本月总工时</div>' +
      '<div class="value">—</div><div class="meta">' + message + '</div></div>';
    el.dayChart.innerHTML = '<div class="empty">' + message + '</div>';
    el.roleList.innerHTML = '<div class="empty">暂无数据</div>';
    el.staffTable.innerHTML = '<div class="empty">暂无数据</div>';
    el.detailCard.innerHTML = '<div class="empty">暂无数据</div>';
    el.dayChartSub.textContent = '按天统计全店打卡工时';
  }

  /* ---------------- 主流程 ---------------- */

  function render() {
    var todayYm = D.ymOf(new Date());
    el.monthPicker.value = state.ym;

    if (state.ym > todayYm) {
      renderEmpty('该月份尚未开始，暂无数据');
      return;
    }
    if (!D.isOpenMonth(state.ym)) {
      renderEmpty('该月份早于开业时间（' + D.STORE.openDate + ' 开业），暂无数据');
      return;
    }

    var per = currentPeriod();
    var month = D.getMonth(state.ym, per.asOf);
    var prev = prevPeriod();
    var prevMonth = prev ? D.getMonth(prev.ym, prev.asOf) : null;

    var sales = periodSales(month);
    var prevSales = prevMonth ? periodSales(prevMonth) : 0;

    state.compareLabel = prev
      ? (per.isCurrent ? '较上月同期' : '较上月')
      : '开业首月，无对比数据';

    renderStatus(month, per);
    renderKpis(month, prevMonth, sales, prevSales);
    renderDayChart(month);
    renderRoles(month);
    renderStaffTable(month);
    renderDetail(month);
  }

  function setMonth(delta) {
    var d = fromKey(state.ym + '-01');
    d.setMonth(d.getMonth() + delta);
    state.ym = D.ymOf(d);
    render();
  }

  /* ---------------- 事件绑定 ---------------- */

  el.monthPicker.value = state.ym;
  el.monthPicker.max = D.ymOf(new Date());
  el.monthPicker.min = D.STORE.openDate.slice(0, 7);

  el.monthPicker.addEventListener('change', function () {
    if (!el.monthPicker.value) return;
    state.ym = el.monthPicker.value.slice(0, 7);
    render();
  });
  document.getElementById('prevMonth').addEventListener('click', function () { setMonth(-1); });
  document.getElementById('nextMonth').addEventListener('click', function () { setMonth(1); });
  document.getElementById('thisMonthBtn').addEventListener('click', function () {
    state.ym = D.ymOf(new Date());
    render();
  });

  // 本月进行中时每分钟刷新，跨点后自动延长统计
  setInterval(function () {
    if (state.ym === D.ymOf(new Date())) render();
  }, 60 * 1000);

  render();
})();
