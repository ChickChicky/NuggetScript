/**
 * @typedef {Type|NS_Function|NS_String|NS_Number|NS_Void} NsType 
 */

class Type {

    constructor () {

    }

}

class RunningContext {
    constructor (scope,i=0) {
        this.scope = scope;
        this.i = i;
        this.f = 0;
    }
}

class ResolvingContext {
    constructor (scope) {
        this.scope = scope;
        this.f = 0;
    }
}

class NS_Function {

    /**
     * @param {Function} code 
     */
    constructor (code,args) {
        this.__dat = {};
        this.__dat.code = code;
        this.__dat.args = args;
    }

    /**
     * @param {Runner} runner
     * @param {any[]} args
     * @param {any[]} args_generic
     */
    __call__(runner,args,args_generic) {
        let f = this.__dat.code;
        if (f instanceof Function) {
            runner.stack.push(f.apply(this,[runner,args,args_generic]));
        } else {
            runner.call_stack.push(new RunningContext(this.__dat.code.children,0));
            for (let ai in args) {
                runner.globals.at(-1)[this.__dat.args[ai].name] = args[ai];
            }
        }
    }

}

class NS_String {

    constructor (value) {
        this.__dat = {};
        this.__dat.value = value;
    }

    /**
     * @param {NsType} type 
     */
    __cast__(type) {
        if (type == Number) return +this.__dat.value.toString();
        if (type == NS_Number) return new NS_Number(+this.__dat.value.toString());
    }

    __repr__() {
        return this.__dat.value;
    }

}

class NS_Number {

    constructor (value) {
        this.__dat = {}
        let v = value;
        if (typeof v.__cast__ == 'function') v = v.__cast__(Number);
        this.__dat.value = typeof value == 'object' ? v : +value;
        this.__dat.rvalue = +value.toString();

        this.__type__ = new Type();
    }

    __cast__(type) {
        if (type == NS_Number)   return this;
        if (type == Number)      return this.__dat.rvalue;
        if (type == NS_String)   return new NS_String(this.__dat.rvalue.toString());
        if (type == String)      return this.__dat.rvalue.toString();
        if (type == Boolean)     return !!this.__dat.rvalue;
        if (type == NS_Boolean)  return new NS_Boolean(!!this.__dat.rvalue);
    }

    __add__(other) {
        return new NS_Number(other.__cast__(Number)+this.__cast__(Number));
    }

    __repr__() {
        return this.__dat.value.toString();
    }

}

class NS_Void {

    constructor () {};

    __cast__(type) {
        if (type == NS_Number)   return new NS_Number(this.__cast__(Number));
        if (type == Number)      return 0;
        if (type == NS_String)   return new NS_String(this.__cast__(String));
        if (type == String)      return 'void';
        if (type == NS_Boolean)  return new Boolean(this.value);
        if (type == Boolean)     return false;
    }

}

class NS_Boolean {

    /**
     * @param {NsType} value 
     */
    constructor (value) {
        this.__dat = {}
        this.__dat.value = 
              value instanceof NS_Void ?
                false
            : value instanceof NS_Number ? 
                value.__dat.value != 0
            : value instanceof NS_String ?
                value.__dat.value.length != 0
            : value instanceof NS_Function ?
                true
            : value instanceof NS_Boolean ? 
                !!value.__dat.value
            : !!value;
    }

    __cast__(type) {
        if (type == NS_Number)   return new NS_Number(this.__cast__(Number));
        if (type == Number)      return this.__dat.value ? 1 : 0;
        if (type == NS_String)   return new NS_String(this.__cast__(String));
        if (type == String)      return this.__dat.value ? 'true' : 'false';
        if (type == NS_Boolean)  return new Boolean(this.value);
        if (type == Boolean)     return this.value;
    }

    __repr__() {
        return this.__dat.value ? 'true' : 'false';
    }

}

module.exports = { Function:NS_Function, String:NS_String, Void:NS_Void, RunningContext, ResolvingContext, Number:NS_Number, Boolean:NS_Boolean }