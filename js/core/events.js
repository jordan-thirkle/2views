window.V2 = window.V2 || {};
V2.events = (function () {
  var handlers = {};
  return {
    on: function (k, fn) { (handlers[k] = handlers[k] || []).push(fn); },
    emit: function (k, data) { (handlers[k] || []).forEach(function (fn) { try { fn(data); } catch (e) {} }); }
  };
})();
