/* ============================================================
 * 共享数据层（演示用虚拟数据）：门店经营数据 + 员工考勤数据
 * 所有数字都以日期为随机种子确定性生成，同一天/同一月每次打开结果一致。
 * 供销售看板（app.js）与员工工时页（staff.js）共用。
 * ========================================================== */
(function (root) {
  'use strict';

  /* ---------------- 1. 门店基础配置 ---------------- */

  var STORE = {
    name: '云栖咖啡 · 中山路店',
    openDate: '2024-01-01',  // 开业日期：早于这一天的日期没有经营数据
    openHour: 7,     // 营业开始（含）
    closeHour: 22,   // 营业结束（不含）
    baseOrders: 6.2  // 营业系数：全天订单量 ≈ 各小时权重之和 × 该系数
  };

  // 是否已开业：日期键（YYYY-MM-DD）与月份键（YYYY-MM）都可判断
  function isOpenDay(dateKey) { return dateKey >= STORE.openDate; }
  function isOpenMonth(ym) { return ym >= STORE.openDate.slice(0, 7); }

  // 商品档案：名称 / 品类 / 单价 / 受欢迎程度（相对权重）
  var CATALOG = [
    { name: '拿铁咖啡',     cat: '现制饮品', price: 32, pop: 2.4 },
    { name: '美式咖啡',     cat: '现制饮品', price: 26, pop: 2.0 },
    { name: '生椰拿铁',     cat: '现制饮品', price: 36, pop: 2.2 },
    { name: '抹茶拿铁',     cat: '现制饮品', price: 34, pop: 1.3 },
    { name: '手冲单品',     cat: '现制饮品', price: 42, pop: 0.7 },
    { name: '柠檬气泡水',   cat: '现制饮品', price: 22, pop: 0.9 },

    { name: '可颂',         cat: '烘焙',     price: 18, pop: 1.8 },
    { name: '肉桂卷',       cat: '烘焙',     price: 22, pop: 1.1 },
    { name: '全麦吐司',     cat: '烘焙',     price: 16, pop: 0.8 },
    { name: '芝士蛋糕',     cat: '烘焙',     price: 28, pop: 1.4 },
    { name: '黄油曲奇',     cat: '烘焙',     price: 12, pop: 0.7 },

    { name: '鸡胸沙拉',     cat: '简餐',     price: 42, pop: 1.5 },
    { name: '火腿三明治',   cat: '简餐',     price: 30, pop: 1.6 },
    { name: '番茄意面',     cat: '简餐',     price: 48, pop: 1.2 },
    { name: '牛肉卷饼',     cat: '简餐',     price: 38, pop: 1.0 },

    { name: '挂耳咖啡礼盒', cat: '零售商品', price: 88,  pop: 0.5 },
    { name: '咖啡豆 250g',  cat: '零售商品', price: 96,  pop: 0.6 },
    { name: '陶瓷保温杯',   cat: '零售商品', price: 128, pop: 0.3 },
    { name: '亚麻帆布袋',   cat: '零售商品', price: 68,  pop: 0.4 }
  ];

  var CATEGORIES = ['现制饮品', '烘焙', '简餐', '零售商品'];

  // 品类基础销售占比（相对权重），零售商品顺手买的比例很低
  var CAT_BASE = {
    '现制饮品': 3.4,
    '烘焙': 1.15,
    '简餐': 1.6,
    '零售商品': 0.22
  };

  // 品类在一天不同时段的销售倾向（早 7–10 / 午 11–14 / 晚 15–19 / 夜 20–22）
  var CAT_TIME_MIX = {
    '现制饮品': { morning: 1.6, noon: 1.3, evening: 1.0, night: 0.7 },
    '烘焙':     { morning: 1.9, noon: 0.8, evening: 0.6, night: 0.3 },
    '简餐':     { morning: 0.4, noon: 2.0, evening: 1.1, night: 0.5 },
    '零售商品': { morning: 0.5, noon: 0.8, evening: 1.3, night: 0.9 }
  };

  // 一天中各小时的客流权重（营业时间外为 0）
  var HOUR_WEIGHT = [
    0, 0, 0, 0, 0, 0, 0,
    0.5, 2.5, 3.5, 3.0,      // 07 08 09 10
    3.2, 5.0, 5.5, 4.5,      // 11 12 13 14
    4.2, 3.6, 3.0, 2.6,      // 15 16 17 18
    2.2, 1.6, 1.0, 0.5       // 19 20 21 22
  ];

  // 支付方式（权重 %）
  var PAYMENTS = [
    { name: '微信支付', weight: 46, color: '#4f46e5' },
    { name: '支付宝',   weight: 32, color: '#0ea5e9' },
    { name: '会员储值', weight: 10, color: '#10b981' },
    { name: '银行卡',   weight: 8,  color: '#f59e0b' },
    { name: '现金',     weight: 4,  color: '#ef4444' }
  ];

  /* ---------------- 2. 通用工具 ---------------- */

  function hashString(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // 确定性伪随机数发生器
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickWeighted(rnd, items, weightOf) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += weightOf(items[i]);
    var r = rnd() * total;
    for (i = 0; i < items.length; i++) {
      r -= weightOf(items[i]);
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function toKey(date) {
    var m = date.getMonth() + 1, d = date.getDate();
    return date.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
  }

  function fromKey(key) {
    var p = key.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function shiftDays(date, n) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  function money(n) {
    return '¥' + Math.round(n).toLocaleString('zh-CN');
  }

  function num(n) {
    return Math.round(n).toLocaleString('zh-CN');
  }

  function pct(n) {
    return (n * 100).toFixed(1) + '%';
  }

  function weekdayName(date) {
    return '周' + '日一二三四五六'.charAt(date.getDay());
  }

  function timeSegment(hour) {
    if (hour <= 10) return 'morning';
    if (hour <= 14) return 'noon';
    if (hour <= 19) return 'evening';
    return 'night';
  }

  /* ---------------- 3. 生成某一天的虚拟成交数据 ---------------- */

  function buildDay(key) {
    var date = fromKey(key);
    var rnd = mulberry32(hashString('yunqi-' + key));

    var weekday = date.getDay();
    var weekendFactor = (weekday === 0 || weekday === 6) ? 1.3 : (weekday === 5 ? 1.14 : 1);
    var dayFactor = 0.88 + rnd() * 0.3;          // 当天整体生意好坏
    var scale = STORE.baseOrders * weekendFactor * dayFactor;

    var hourly = [];
    var orders = [];
    var hour, i, j;

    for (hour = 0; hour < 24; hour++) {
      var w = HOUR_WEIGHT[hour] || 0;
      var count = w > 0 ? Math.max(1, Math.round(scale * w * (0.88 + rnd() * 0.24))) : 0;

      var hourOrders = 0, hourSales = 0;

      for (i = 0; i < count; i++) {
        // 一单里买几件商品
        var r = rnd();
        var lines = r < 0.78 ? 1 : (r < 0.96 ? 2 : 3);
        var amount = 0;
        var items = [];
        var segment = timeSegment(hour);

        for (j = 0; j < lines; j++) {
          var cat = pickWeighted(rnd, CATEGORIES, function (c) {
            return CAT_BASE[c] * CAT_TIME_MIX[c][segment];
          });
          var pool = CATALOG.filter(function (p) { return p.cat === cat; });
          var product = pickWeighted(rnd, pool, function (p) { return p.pop; });
          var qty = rnd() < 0.93 ? 1 : 2;

          amount += product.price * qty;
          items.push({ name: product.name, cat: product.cat, price: product.price, qty: qty });
        }

        var payment = pickWeighted(rnd, PAYMENTS, function (p) {
          return p.weight * (0.85 + rnd() * 0.3);
        }).name;

        hourOrders++;
        hourSales += amount;
        orders.push({ hour: hour, amount: amount, items: items, payment: payment });
      }

      hourly.push({ hour: hour, orders: hourOrders, sales: hourSales });
    }

    /* ---- 汇总 ---- */
    var totalSales = 0, totalItems = 0;
    var byProduct = {};
    var byCategory = {};
    var byPayment = {};

    CATEGORIES.forEach(function (c) { byCategory[c] = { sales: 0, qty: 0 }; });
    PAYMENTS.forEach(function (p) { byPayment[p.name] = { sales: 0, orders: 0 }; });

    orders.forEach(function (o) {
      totalSales += o.amount;
      byPayment[o.payment].sales += o.amount;
      byPayment[o.payment].orders += 1;

      o.items.forEach(function (it) {
        totalItems += it.qty;
        byCategory[it.cat].sales += it.price * it.qty;
        byCategory[it.cat].qty += it.qty;

        if (!byProduct[it.name]) {
          byProduct[it.name] = { name: it.name, cat: it.cat, price: it.price, qty: 0, sales: 0 };
        }
        byProduct[it.name].qty += it.qty;
        byProduct[it.name].sales += it.price * it.qty;
      });
    });

    // 退款：少量订单退单
    var refundCount = Math.floor(orders.length * (0.006 + rnd() * 0.012));
    var avgOrder = orders.length ? totalSales / orders.length : 0;
    var refundAmount = Math.round(refundCount * avgOrder * (0.75 + rnd() * 0.5));

    var peaks = hourly.filter(function (h) { return h.sales > 0; });
    var peak = peaks.reduce(function (a, b) { return b.sales > a.sales ? b : a; }, peaks[0] || { hour: 0, sales: 0, orders: 0 });

    return {
      key: key,
      date: date,
      hourly: hourly,
      totalSales: totalSales,
      orders: orders.length,
      items: totalItems,
      netSales: totalSales - refundAmount,
      refundAmount: refundAmount,
      refundCount: refundCount,
      aov: orders.length ? totalSales / orders.length : 0,
      peak: peak,
      firstOrderHour: (peaks[0] || {}).hour,
      lastOrderHour: (peaks[peaks.length - 1] || {}).hour,
      categories: CATEGORIES.map(function (c) {
        return { name: c, sales: byCategory[c].sales, qty: byCategory[c].qty };
      }).filter(function (c) { return c.sales > 0; }),
      payments: PAYMENTS.map(function (p) {
        return {
          name: p.name, color: p.color,
          sales: byPayment[p.name].sales,
          orders: byPayment[p.name].orders
        };
      }).filter(function (p) { return p.sales > 0; }),
      products: Object.keys(byProduct).map(function (k) { return byProduct[k]; })
        .sort(function (a, b) { return b.sales - a.sales; })
    };
  }

  /* ---------------- 4. 数据缓存与切片 ---------------- */

  var cache = {};
  function getDay(key) {
    if (!cache[key]) cache[key] = buildDay(key);
    return cache[key];
  }

  // 把一天的数据截断到指定小时（含），用于「今天还在营业中」的场景
  function sliceTo(day, hour) {
    var hourly = day.hourly.filter(function (h) { return h.hour <= hour; });
    var totalSales = hourly.reduce(function (s, h) { return s + h.sales; }, 0);
    var orders = hourly.reduce(function (s, h) { return s + h.orders; }, 0);
    var ratio = day.totalSales > 0 ? totalSales / day.totalSales : 0;
    var active = hourly.filter(function (h) { return h.sales > 0; });
    var peak = active.reduce(function (a, b) { return b.sales > a.sales ? b : a; }, { hour: -1, sales: 0, orders: 0 });

    return {
      partial: true,
      key: day.key,
      date: day.date,
      hourly: hourly,
      totalSales: totalSales,
      orders: orders,
      items: Math.round(day.items * ratio),
      netSales: Math.round(day.netSales * ratio),
      refundAmount: Math.round(day.refundAmount * ratio),
      refundCount: Math.round(day.refundCount * ratio),
      aov: orders ? totalSales / orders : 0,
      peak: peak,
      firstOrderHour: (active[0] || {}).hour,
      lastOrderHour: (active[active.length - 1] || {}).hour,
      categories: day.categories.map(function (c) {
        return { name: c.name, sales: Math.round(c.sales * ratio), qty: Math.round(c.qty * ratio) };
      }).filter(function (c) { return c.sales > 0; }),
      payments: day.payments.map(function (p) {
        return { name: p.name, color: p.color, sales: Math.round(p.sales * ratio), orders: Math.round(p.orders * ratio) };
      }).filter(function (p) { return p.sales > 0; }),
      products: day.products.map(function (p) {
        return { name: p.name, cat: p.cat, price: p.price, qty: Math.round(p.qty * ratio), sales: Math.round(p.sales * ratio) };
      }).filter(function (p) { return p.qty > 0; })
    };
  }

  /* ---------------- 5. 员工名册与班次 ---------------- */

  // 固定班次：班次名 / 上班时间 / 下班时间 / 中间休息（分钟）
  // 早/中/晚班都是 9 小时跨度、扣 1 小时休息 = 8 小时实际工时，正好对应 21.75 天 × 8 小时的标准月工时
  var SHIFTS = {
    morning: { name: '早班', inMin: 7 * 60,  outMin: 16 * 60, breakMin: 60 },
    mid:     { name: '中班', inMin: 11 * 60, outMin: 20 * 60, breakMin: 60 },
    night:   { name: '晚班', inMin: 13 * 60, outMin: 22 * 60, breakMin: 60 },
    full:    { name: '全班', inMin: 8 * 60,  outMin: 20 * 60, breakMin: 90 }
  };

  // 员工名册：全职按 restDays 固定周休，兼职按每周出勤天数随机排班
  var EMPLOYEES = [
    { id: 'E01', name: '陈立', role: '店长',      type: '全职', restDays: [1, 4], shiftWeights: { full: 2, mid: 4, morning: 2 } },
    { id: 'E02', name: '林晓', role: '咖啡师',    type: '全职', restDays: [2, 5], shiftWeights: { morning: 4, mid: 2, night: 3 } },
    { id: 'E03', name: '周然', role: '咖啡师',    type: '全职', restDays: [3, 6], shiftWeights: { morning: 3, mid: 2, night: 4 } },
    { id: 'E04', name: '吴敏', role: '收银/服务', type: '全职', restDays: [0, 3], shiftWeights: { morning: 3, mid: 3, night: 3 } },
    { id: 'E05', name: '赵鹏', role: '后厨',      type: '全职', restDays: [1, 5], shiftWeights: { morning: 4, mid: 3, night: 1 } },
    { id: 'E06', name: '苏晴', role: '服务员',    type: '兼职', daysPerWeek: 3, partStarts: [11, 15, 17], partLengths: [4, 5, 6] },
    { id: 'E07', name: '何俊', role: '咖啡师',    type: '兼职', daysPerWeek: 3, partStarts: [7, 10, 15],  partLengths: [4, 5] }
  ];

  // 法定月平均工时参考值：21.75 天 × 8 小时
  var STANDARD_MONTH_HOURS = 174;

  // 上班/下班打卡时间允许的浮动（分钟）
  var EARLY_TOLERANCE = 6;    // 晚到 6 分钟以内不算迟到
  var EARLY_LEAVE_TOLERANCE = 16;
  var OVERTIME_MIN = 30;      // 晚走 30 分钟以上算加班

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // 分钟数 → 'HH:MM'
  function fmtClock(min) {
    if (min === null || min === undefined) return '—';
    return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60);
  }

  // 小时数 → 保留一位小数的字符串
  function fmtHours(h) { return (Math.round(h * 10) / 10).toFixed(1); }

  // 日期键 → 'YYYY-MM'
  function ymOf(dateKeyOrDate) {
    return typeof dateKeyOrDate === 'string' ? dateKeyOrDate.slice(0, 7) : toKey(dateKeyOrDate).slice(0, 7);
  }

  /* ---------------- 6. 生成某员工某天的考勤记录 ---------------- */

  // nowMin：当「这一天就是今天」时传入当前已过去的分钟数，用于标记进行中的班次
  function buildAttendance(emp, dateKey, nowMin) {
    var rnd = mulberry32(hashString('staff-' + emp.id + '-' + dateKey));
    var date = fromKey(dateKey);
    var weekday = date.getDay();

    // 排班：今天是否上班
    if (emp.type === '全职') {
      var onRestDay = emp.restDays.indexOf(weekday) >= 0;
      if (onRestDay && rnd() > 0.07) return { off: true, reason: '休息' };  // 小概率调班
    } else {
      if (rnd() >= emp.daysPerWeek / 7) return { off: true, reason: '休息' };
    }

    // 全职员工偶尔请假
    if (emp.type === '全职' && rnd() < 0.02) return { off: true, reason: '请假' };

    var shiftName, schedIn, schedOut, breakMin;
    if (emp.type === '全职') {
      var keys = Object.keys(emp.shiftWeights);
      var key = pickWeighted(rnd, keys, function (k) { return emp.shiftWeights[k]; });
      var s = SHIFTS[key];
      shiftName = s.name; schedIn = s.inMin; schedOut = s.outMin; breakMin = s.breakMin;
    } else {
      var startHour = emp.partStarts[Math.floor(rnd() * emp.partStarts.length)];
      var lenHour = emp.partLengths[Math.floor(rnd() * emp.partLengths.length)];
      schedIn = startHour * 60;
      schedOut = Math.min(schedIn + lenHour * 60, STORE.closeHour * 60);
      breakMin = 0;
      shiftName = '兼职班';
    }

    // 打卡浮动：多数准点，偶尔迟到；下班偶尔晚走
    var inOffset = rnd() < 0.14 ? 6 + Math.floor(rnd() * 20) : Math.round(rnd() * 8 - 4);
    var outOffset = rnd() < 0.26 ? 20 + Math.floor(rnd() * 55) : Math.round(rnd() * 9 - 3);
    var inMin = Math.max(0, schedIn + inOffset);
    var outMin = schedOut + outOffset;

    var ongoing = false;
    var clockOut = outMin;
    if (nowMin !== null && nowMin < outMin) {
      if (nowMin < inMin) return { off: true, reason: '未开始' };  // 今天还没到上班时间
      ongoing = true;
      clockOut = nowMin;
    }

    var spanMin = Math.max(0, clockOut - inMin);
    // 进行中的班次按已工作时长等比扣除休息时间
    var breakTaken = ongoing
      ? Math.round(breakMin * Math.min(1, spanMin / Math.max(1, schedOut - schedIn)))
      : breakMin;
    var workedMin = Math.max(0, spanMin - breakTaken);

    var tags = [];
    if (ongoing) {
      tags.push('进行中');
    } else {
      if (inOffset >= EARLY_TOLERANCE) tags.push('迟到');
      if (outOffset <= -EARLY_LEAVE_TOLERANCE) tags.push('早退');
      if (outOffset >= OVERTIME_MIN) tags.push('加班');
    }

    return {
      off: false,
      empId: emp.id,
      dateKey: dateKey,
      day: date.getDate(),
      weekday: weekday,
      shiftName: shiftName,
      schedIn: schedIn,
      schedOut: schedOut,
      inMin: inMin,
      outMin: ongoing ? null : outMin,
      clockOut: clockOut,
      breakMin: breakTaken,
      hours: workedMin / 60,
      overtimeHours: (!ongoing && outOffset >= OVERTIME_MIN) ? outOffset / 60 : 0,
      ongoing: ongoing,
      tags: tags,
      status: tags.length ? tags.join(' · ') : '正常'
    };
  }

  /* ---------------- 7. 生成某个月的考勤与工时统计 ---------------- */

  var monthCache = {};

  // asOfDay：只统计到该月第几天（本月还在进行时用），不传则统计整月
  function getMonth(ym, asOfDay) {
    var cacheKey = ym + '#' + (asOfDay || 'full');
    if (monthCache[cacheKey]) return monthCache[cacheKey];

    var year = +ym.slice(0, 4);
    var month = +ym.slice(5, 7);
    var daysInMonth = new Date(year, month, 0).getDate();
    var lastDay = asOfDay ? Math.min(asOfDay, daysInMonth) : daysInMonth;

    var todayKey = toKey(new Date());
    var nowMin = new Date().getHours() * 60 + new Date().getMinutes();

    var byEmp = {};
    EMPLOYEES.forEach(function (e) { byEmp[e.id] = []; });

    var days = [];
    for (var d = 1; d <= lastDay; d++) {
      var dateKey = ym + '-' + pad2(d);
      var isToday = dateKey === todayKey;
      var dayHours = 0;
      var onDuty = [];

      EMPLOYEES.forEach(function (emp) {
        var rec = buildAttendance(emp, dateKey, isToday ? nowMin : null);
        byEmp[emp.id].push({
          empId: emp.id,
          dateKey: dateKey,
          day: d,
          weekday: fromKey(dateKey).getDay(),
          isToday: isToday,
          rec: rec
        });
        if (rec && !rec.off) {
          dayHours += rec.hours;
          onDuty.push(emp.name);
        }
      });

      days.push({
        dateKey: dateKey,
        day: d,
        weekday: fromKey(dateKey).getDay(),
        hours: dayHours,
        onDutyCount: onDuty.length,
        onDuty: onDuty,
        isToday: isToday
      });
    }

    // 每位员工的月度汇总
    var staff = EMPLOYEES.map(function (emp) {
      var entries = byEmp[emp.id];
      var totalHours = 0, overtimeHours = 0, restDays = 0, leaveDays = 0;
      var workDays = 0, lateCount = 0, earlyLeaveCount = 0, longestDay = 0, ongoingToday = false;

      var daily = entries.map(function (en) {
        var r = en.rec;
        var hours = 0, status = '休息', kind = 'rest';

        if (!r) {
          status = '休息';
        } else if (r.off) {
          if (r.reason === '请假') { leaveDays++; status = '请假'; kind = 'leave'; }
          else if (r.reason === '未开始') { status = '未开始'; kind = 'idle'; }
          else { restDays++; status = '休息'; kind = 'rest'; }
        } else {
          hours = r.hours;
          kind = 'work';
          status = r.status;
          workDays++;
          totalHours += r.hours;
          overtimeHours += r.overtimeHours;
          if (r.tags.indexOf('迟到') >= 0) lateCount++;
          if (r.tags.indexOf('早退') >= 0) earlyLeaveCount++;
          if (r.ongoing) ongoingToday = true;
          if (r.hours > longestDay) longestDay = r.hours;
        }

        return {
          dateKey: en.dateKey,
          day: en.day,
          weekday: en.weekday,
          isToday: en.isToday,
          kind: kind,
          status: status,
          hours: hours,
          ongoing: !!(r && r.ongoing),
          rec: r && !r.off ? r : null
        };
      });

      // 本月进行中时，工时参考值按月进度等比折算，便于比较达成率
      var reference = STANDARD_MONTH_HOURS * (lastDay / daysInMonth);

      return {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        type: emp.type,
        workDays: workDays,
        restDays: restDays,
        leaveDays: leaveDays,
        totalHours: totalHours,
        overtimeHours: overtimeHours,
        lateCount: lateCount,
        earlyLeaveCount: earlyLeaveCount,
        avgHours: workDays ? totalHours / workDays : 0,
        longestDay: longestDay,
        ongoingToday: ongoingToday,
        referenceHours: reference,
        achievement: reference ? totalHours / reference : 0,
        daily: daily
      };
    });

    var totalHours = 0, personTimes = 0, overtimeHours = 0, lateCount = 0, earlyLeaveCount = 0;
    staff.forEach(function (s) {
      totalHours += s.totalHours;
      personTimes += s.workDays;
      overtimeHours += s.overtimeHours;
      lateCount += s.lateCount;
      earlyLeaveCount += s.earlyLeaveCount;
    });

    var activeStaff = staff.filter(function (s) { return s.workDays > 0; }).length;

    // 按岗位汇总工时
    var roleMap = {};
    staff.forEach(function (s) {
      if (!roleMap[s.role]) roleMap[s.role] = { role: s.role, hours: 0, workDays: 0, staffCount: 0 };
      roleMap[s.role].hours += s.totalHours;
      roleMap[s.role].workDays += s.workDays;
      roleMap[s.role].staffCount += 1;
    });

    var result = {
      ym: ym,
      year: year,
      month: month,
      daysInMonth: daysInMonth,
      lastDay: lastDay,
      partial: lastDay < daysInMonth,
      days: days,
      staff: staff,
      totalHours: totalHours,
      personTimes: personTimes,
      overtimeHours: overtimeHours,
      lateCount: lateCount,
      earlyLeaveCount: earlyLeaveCount,
      activeStaff: activeStaff,
      avgPerStaff: activeStaff ? totalHours / activeStaff : 0,
      avgOnDuty: lastDay ? personTimes / lastDay : 0,
      avgDailyHours: lastDay ? totalHours / lastDay : 0,
      byRole: Object.keys(roleMap).map(function (k) { return roleMap[k]; })
        .sort(function (a, b) { return b.hours - a.hours; })
    };

    monthCache[cacheKey] = result;
    return result;
  }

  /* ---------------- 8. 对外暴露 ---------------- */

  var api = {
    STORE: STORE,
    isOpenDay: isOpenDay,
    isOpenMonth: isOpenMonth,
    CATEGORIES: CATEGORIES,
    EMPLOYEES: EMPLOYEES,
    SHIFTS: SHIFTS,
    STANDARD_MONTH_HOURS: STANDARD_MONTH_HOURS,
    toKey: toKey,
    fromKey: fromKey,
    shiftDays: shiftDays,
    ymOf: ymOf,
    money: money,
    num: num,
    pct: pct,
    weekdayName: weekdayName,
    fmtClock: fmtClock,
    fmtHours: fmtHours,
    pad2: pad2,
    getDay: getDay,
    sliceTo: sliceTo,
    getMonth: getMonth
  };

  root.StoreData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
