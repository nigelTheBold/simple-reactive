(function(w, undefined) {

	// A common Simple Reactive atom with just the fundamentals
	var Atom = function(opt) {
		this.NEXT = [];
		this.OPT = opt || {};
		this.STARTED = false;
		this.ME = undefined;
		this.CTX = undefined;

		if (this.OPT.event) {
			this.event = this.OPT.event;
		}

		if (this.OPT.error) {
			this.error = this.OPT.error;
		}

		if (this.OPT.parent) {
			parent.chain(this);
		}

		if (this.OPT.context) {
			this.CTX = this.OPT.context;
		}
		
		if (this.OPT.init) {
			this.OPT.init.call(this);
		}

	};

	// Basic atomic functionality
	Atom.fn = Atom.prototype = {
		chain: function(atom) {
			this.NEXT.push(atom);
			if (this.STARTED)
				atom.begin(this.CTX, this.ME);
			return atom;
		},

		unchain: function(atom) {
			
		},
		
		begin: function(ctx, me) {
			this.ME = me;
			this.CTX = ctx;
			this.STARTED = true;
			var fn = function() {this.NEXT.forEach(function(i) {i.begin(ctx, me)})}
			if (!this.OPT.begin || this.OPT.begin(ctx, me, fn))
				fn();
		},

		end: function(ctx, me) {
			this.NEXT.forEach(function(i) {i.end(ctx, me)});

			this.STARTED = false;
			this.ME = undefined;
			this.CTX = undefined;
		},
		
		event: function(ev, ctx, me) {
			this.NEXT.forEach(function(i) {i.event(ev, ctx, me)});
		},

		error: function(err, ctx, me) {
			this.NEXT.forEach(function(i) {i.error(err, ctx, me)});
		},

		reset: function(ctx, me) {
			this.NEXT.forEach(function(i) {i.reset(ctx, me)});
		},

		filter: function(fn){
			var m;
			var t = this.chain(new Atom({
				event: function(ev, ctx, me) {
					m = me;
					if (fn(ev, ctx, tfn, me)) {
						this.NEXT.forEach(function(i) {i.event(ev, ctx, me)});
					}
				},
			}));
			var tfn = function(ev, ctx) {t.NEXT.forEach(function(i) {i.event(ev, m, ctx)})};
			return t;
		},
		
		onEvent: function(fn){
			return this.chain(new Atom({
				event: function(ev, ctx, me) {
					fn(ev, ctx, me);
					this.NEXT.forEach(function(i) {i.event(ev, ctx, me)})
				},
			}))
		},
		
		onError: function(fn){
			return this.chain(new Atom({
				error: function(err, ctx, me) {
					fn(err, ctx, me);
					this.NEXT.forEach(function(i) {i.error(err, ctx, me)})
				},
			}))
		},

		map: function(fn){
			return this.chain(new Atom({
				event:  function(ev, ctx, me) {
					var v = fn(ev, ctx, me);
					this.NEXT.forEach(function(i) {i.event(v, ctx, me)})
				},
			}))
		},

		reduce: function(fn){
			return this.chain(new Atom({
				begin: function(ctx, me) {
					this.REDUCE_VAL = undefined;
				},
				event: function(ev, ctx, me) {
					this.REDUCE_VAL =  fn(this.REDUCE_VAL, ev, ctx, me);
				},
				end: function(ctx, me) {
					var val = this.REDUCE_VAL;
					this.NEXT.forEach(function(i) {i.event(val, ctx, me)})
				},
			}))
		},

		async: function(delay){
			return this.chain(new Atom({
				event: function(value, ctx, me) {
					var t = this;
					delay = delay || 0;
					setTimeout(
						function() {t.NEXT.forEach(function(i) {i.event(value, ctx, me)})},
						delay);
				},
			}))
		},

		timeout: function(fn, delay) {
			var to = delay || 10 * 1000; // 10s
			var id;
			return this.chain(new Atom({
				begin: function() {
					id = setTimeout(fn, delay);
				},

				event: function(ev, ctx, me) {
					if (id)
						clearTimeout(id);

					this.NEXT.forEach(function(i) {i.event(val, ctx, me)})
					id = setTimeout(fn, delay);
				},

				end: function() {
					if (id)
						clearTimeout(id);
				},
			}))
		},

		each: function() {
			var targets;
			return this.chain(new Atom({
				init: function() {
					targets = this.NEXT;
				},
				event: function(ev, ctx, me) {
					// TODO: Throw and exception if ev is not an array
					targets.forEach(function(i) {i.begin(ctx, me)});
					ev.forEach(function(val) {
						targets.forEach(function(i) {i.event(val, ctx, me)});
					});
					targets.forEach(function(i) {i.end(ctx, me)});
				},
			}));
		},
		
		tee: function(obj) {
			// TODO: Throw an exception when obj doesn't accept events
			this.chain(obj);
			return this;
		},

		merge: function(obj) {
			// TODO: Throw an exception when obj doesn't chain
			obj.chain(this);
			return this;
		},

		source: function(obj, ctx) {
			var t = this;
			if (obj instanceof Array) {
				setTimeout(function() {
					obj.forEach(function(i) {t.event(i, ctx, t)})
				}, 0);
			}
			else if (typeof obj == 'function') {
				obj(function(ev){t.event(ev, ctx, undefined)});
				
			}
			else if (obj instanceof Object && obj != null) {
				if (obj.chain && obj.NEXT) {
					// Treat it like an SRx object
					obj.chain(t);
				}
				
				else if (typeof obj.then == 'function') {
					// Seems like it's probably a promise
					setTimeout(function() {
						obj.then(
							function(ev){
								t.event(ev, ctx, t);
								t.end(ctx, t);
							},
							function(ev){
								t.error(ev, ctx, t);
								t.end(ctx, t);
							}), 0});
				}
				else {
					
				}
			}
			else if (typeof obj == 'string') {
			}
			else if (typeof obj == 'number') {
			}
			else if (typeof obj == 'boolean') {
			}
			else {
			}
			
		},
	}

    //----------------------------------------------------------------------//	
	w.SRx = function(obj, ctx) {
		Atom.call(this, {
			context: ctx,
		});

		var t = this;
		t._ = {};
		t.NAME = 'SRx';
		t.event = Atom.fn.event.bind(this);

		ctx = ctx || {};
		t.source(obj, ctx);
	};
	
	Atom.fn.SRx = function(obj, ctx) {return new SRx(obj, ctx)}
	
	Atom.fn.throttle = function(delay, reset) {
		var tid;
		var val;
		return this.filter(function(ev, ctx, fn, me) {
			val = ev;
			if (reset) {
				clearTimeout(tid);
				tid = undefined;
			}
			if (!tid) {
				tid = setTimeout(function(){
					clearTimeout(tid);
					tid = undefined;
					fn(val, ctx, me)
				}, delay);
			}
			return false;
		});
	}

	Atom.fn.skipN = function(skip) {
		var n = 0;
		return this.filter(function(ev, ctx, fn, me) {
			if (n++ >= skip) {
				n = 0;
				return true;
			}
			else
				return false;
		});
	}

	Atom.fn.gate = function(opt) {
		var all_events = false;
		var begin_and_end = false;
		var open = false;
		// Parse options
		if (typeof opt === 'Object') {
			all_events = opt.all_events;
			begin_and_end = opt.begin_and_end;
		}
		else {
			all_events = opt;
		}
		
		var gate = this.filter(function() {
			return open;
		});

		var targets = gate.NEXT;
		gate.open = function(ev, ctx, fn, me) {
			open = true;
			if (begin_and_end)
				targets.forEach(function(i) {i.begin(ctx, me)});
			if (all_events && ev)
				this.event(ev);
			return this;
		}.bind(gate);

		gate.close = function(ev, ctx, fn, me) {
			if (all_events && ev)
				this.event(ev);
			if (begin_and_end)
				targets.forEach(function(i) {i.end(ctx, me)});
			open = false;
			return this;
		}.bind(gate);

		gate.closeFn = function(fn) {
			fn(gate.close);
			return this;
		}.bind(gate);
		
		gate.openFn = function(fn) {
			fn(gate.open);
			return this;
		}.bind(gate);
		
		if (opt.open_fn)
			opt.open_fn(gate.open);

		if (opt.close_fn)
			opt.close_fn(gate.close);
		
		return gate;
	}

	
	
	SRx.fn = w.SRx.prototype = Object.create(Atom.prototype);
	SRx.fn.Atom = Atom;

}(window));
