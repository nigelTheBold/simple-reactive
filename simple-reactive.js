(function(w, undefined) {

	w.SRx = function(src, ctx) {
		var t = this;
		this.source = src;
		this.ctx = ctx || {};
		this.running = false;
		
		this._ = {
			event: [],
			start: [],
			end: [],
			error: [],
		}

		if (typeof src === 'function') {
			var t = this;
			src.call(t, t.event.bind(t, ctx));
		}
		else if (src instanceof Array) {
			t.start(ctx);
			src.forEach(t.event.bind(t, ctx));
			t.end(ctx);
		}
		else if (src instanceof SRx) {
			this.source = src.source;
			src.onError(function(c, err) {t.error(c, err)});
			src.onStart(function(c) {t.start(c)});
			src.onEvent(function(c, ev) {t.event(c, ev)});
			src.onEnd(function(c) {t.end(c)});
		}
		else if (src instanceof WebSocket) {
			if (src.readyState === WebSocket.OPEN)
				t.start(ctx);
			src.onopen(t.start.bind(t, ctx));
			src.onclose(t.end.bind(t, ctx));
			src.onmessage(t.event.bind(t, ctx));
			src.onerror(t.error.bind(t, ctx));
		}
		else if (src.then) {
			// Assume it's a promise
		}
		else if (src.hasNext && src.next) {
			// Assume an iterator
		}
		else if (typeof src.on === 'function') {
			var t = this;
			t.on = function(ev) {
				src.on(ev, t.event.bind(t, ctx));
				return t;
			}
		}
		else {
			throw new Error('src is not a valid simple-reactive target');
		}
	}

	w.SRx.fn = w.SRx.prototype = {
		error: function(ctx, err) {
			var t = this;
			t._.error.forEach(function(fn) {fn.call(t, ctx, err)});
			return this;
		},

		event: function(ctx, ev) {
			var t = this;
			if (!this.running)
				t.start(ctx);
			
			t._.event.forEach(function(fn) {fn.call(t, ctx, ev)});
			return this;
		},

		start: function(ctx) {
			var t = this;
			if (!this.running) {
				this.running = true;
				t._.start.forEach(function(fn) {fn.call(t, ctx)});
			}
			return this;
		},

		end: function(ctx) {
			var t = this;
			if (this.running) {
				this.running = false;
				t._.end.forEach(function(fn) {fn.call(t, ctx)});
			}
			return this;
		},
		
		on: function() {return this},

		onEvent: function(fn) {this._.event.push(fn); return this;},
		onError: function(fn) {this._.error.push(fn); return this;},
		onStart: function(fn) {this._.start.push(fn); return this;},
		onEnd:   function(fn) {this._.end.push(fn); return this;},

		async: function(delay) {
			var n = new SRx(this, this.ctx);
			var fn = n.event;
			delay = delay || 0;
			
			n.event = function(ctx, ev) {
				var t = this;
				setTimeout(function(){
					fn.call(t, ctx, ev)}, delay);
				return t;
			}
			return n;
		},

		asyncFn: function(delayFn) {
			var n = new SRx(this, this.ctx);
			var fn = n.event;
			n.event = function(ctx, ev) {
				var t = this;
				setTimeout(function(){
					fn.call(t, ctx, ev)}, delayFn.call(t, ctx, ev));
				return t;
			}
			return n;
		},

		throttle: function(delay) {
			var n = new SRx(this, this.ctx);
			var lastTime = 0;
			var evFn = n.event;
			var lastEv;
			var timeout;
			
			n.event = function(ctx, ev) {
				var t = this;
				lastEv = ev;
				var now = new Date().getTime();
				var del = now - lastTime;
				if (!timeout) {
					timeout = setTimeout(function() {
						evFn.call(t, ctx, lastEv);
						lastTime = now;
						timeout = undefined;
					}, delay);
				}
				return t;
			}
			return n;
		},

		timeout: function(timeout, obj) {
			var n = new SRx(this, this.ctx);
			var evFn = n.event;
			var startFn = n.start;
			var endFn = n.end;
			var errFn = n.error;
			var timeout;
			
			n.start = function(ctx) {

			}

			n.event = function(ctx, ev) {
				var t = this;
				
				evFn.call(t, ctx, ev);
				
				if (timeout)
					clearTimeout(timeout);

				timeout = setTimeout(function() {
					timeout = undefined;
					t.end.call(t, ctx);
				});
			}

			n.end = function(ctx) {
				if (timeout) {
					clearTimeout(timeout);
					timeout = undefined;
				}
				endFn.call(this, ctx);
			}
		},
		
		reduce: function(obj) {
			var n = new SRx(this, this.ctx);
			var evFn = n.event;
			var startFn = n.start;
			var endFn = n.end;
			var errFn = n.error;
			
			var result;

			if (typeof obj === 'function')
				var reduce = {event: obj}
			else
				var reduce = obj;
			
			n.event = function(ctx, ev) {
				result = reduce.event(ctx, res, ev);
				return this;
			}

			n.start = function(ctx) {
				result = undefined;
				startFn.call(this, ctx);
				return this;
			}

			n.end = function(ctx) {
				evFn.call(this, ctx, result);
				endFn.call(this, ctx);
				return this;
			}
			return n;
		},

		filter: function(obj) {
			var n = new SRx(this, this.ctx);
			var evFn = n.event;
			if (typeof obj === 'function')
				var f = {filter: obj.bind(this)}
			else
				var f = obj;

			n.event = function(ctx, ev) {
				var t = this;
				if (f.filter(ctx, ev))
					return evFn.call(t, ctx, ev);
				return t;
			}

			return n;
		},

		map: function(fn) {
			var n = new SRx(this, this.ctx);
			var evFn = n.event;
			
			n.event = function(ctx, ev) {
				var t = this;
				return evFn.call(t, ctx, fn.call(t, ctx, ev));
			}

			return n;
		},

		route: function(fn, obj) {
			var n = new SRx(this, this.ctx);
			var evFn = n.event;

			if (fn instanceof RegExp) {
				var regex = fn;
				fn = function(ctx, ev) {
					return ('' + ev).match(regex);
				}
			}
			
			if (typeof obj === 'function')
				var dest = {event: obj}
			else
				var dest = obj;
			
			n.event = function(ctx, ev) {
				var t = this;
				if (fn.call(t, ctx, ev)) {
					dest.event(ctx, ev);
				}
				evFn.call(t, ctx, ev);
			}

			return n;
		},

		tee: function(obj) {
			this.onError(function(c, err) {obj.error(c, err)});
			this.onStart(function(c) {obj.start(c)});
			this.onEvent(function(c, ev) {obj.event(c, ev)});
			this.onEnd(function(c) {obj.end(c)});

			return this;
		},

		merge: function(obj) {
			var t = this;
			obj.onError(function(c, err) {t.error(c, err)});
			obj.onStart(function(c) {t.start(c)});
			obj.onEvent(function(c, ev) {t.event(c, ev)});
			obj.onEnd(function(c) {t.end(c)});

			return this;
		},

		inject: function(ev) {
			this.event(this.ctx, ev);
		},
	}
}(window));

//----------------------------------------------------------------------//
function srx_init() {
	var Gate = function(state) {
		this.isOpen = state;
	}

	Gate.fn = Gate.prototype = {
		open: function() {this.isOpen = true},
		close: function() {this.isOpen = false},
		filter: function() {return this.isOpen},
	}

	var gate = new Gate(false);
	
	var src = $('.grid');
	var dest = $('.output');
		   
	var srx = new SRx($('.grid'))
		.on('mousedown mousemove')
		.throttle(1000)
		.filter(gate)
		.onEvent(function(ctx, ev) {
			dest.html('X: ' + ev.clientX + ' Y: ' + ev.clientY);
		});

	src.on('mousedown',
		   function(ev) {
			   gate.open();
		   });
	src.on('mouseup', function(ev) {srx.inject(ev); gate.close()});
}


(function() {
	setTimeout(srx_init, 0);
}());
