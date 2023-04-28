const Types = require('./ns_types');
const { RunningContext, ResolvingContext } = Types;
const util = require('node:util');

const DEBUG = 0;

/** @type {(...data:any[])=>void} */
let debug = (...args) => DEBUG ? console.log(...args) : null;

const cloneVar = (v) => {
    let nv = {
        value: new Types.Void()
    }
    if (v.value instanceof Types.Number) {
        nv.value = new Types.Number(v.value.__dat.value);
    }
    return nv;
}

class Runner {

    constructor (tokens) {
        this.tokens = tokens;
        this.globals = [getGlobals(tokens)];
        if (!this.globals[0]['main']) return Error('No entry point found');
        if (this.globals[0]['main'].implementations.length > 1) return Error('Multiple entry points found');

        this.call_stack = [new RunningContext(this.globals[0]['main'].implementations[0].code.children,0)];
        this.stack = [];

        Object.assign(this.globals[0],{
            println : {value:new Types.Function((runner,args)=>(console.log(...args.map(a=>typeof a.value == 'object' ? (typeof a.value.__repr__ == 'function' ? a.value.__repr__() : a) : a)),new Types.Void()))},

        });
    }

    getVars() {
        return this.globals.reduce((acc,v)=>Object.assign(acc,v),{});
    }

    step() {

        if (!this.call_stack.length) return 'END';

        //console.log('CTX',util.inspect(this.call_stack,{colors:true,depth:7}));
        debug('-'.repeat(100));
        debug(this.call_stack.map(i=>i.scope.type??i.constructor.name+'-'+i.i.toString()))

        let ctx = this.call_stack.at(-1);
        debug(ctx);

        // ----- eval stuff ------ \\

        if (ctx instanceof ResolvingContext) {
                
            if (ctx.scope.type == 'ref') {
                debug('REF');
                //console.log(`GOT REF : ${util.inspect(ctx.context)}`);
                /*if (ctx.scope.reftype == 'name') {
                    let g = this.getVars();
                    let v = g[ctx.scope.ref];
                    if (!v) return Error(`Unknown reference '${ctx.scope.ref}'`);
                    ctx.result = v;
                }*/
                if (ctx.scope.reftype == 'name') {
                    debug('  NAME');
                    let g = this.getVars();
                    let v = g[ctx.scope.ref];
                    if (!v) return Error(`Unknown reference '${ctx.scope.ref}'\n  ${ctx.scope.ref.l}\n${' '.repeat(ctx.scope.ref.cn+2)}${'^'.repeat(ctx.scope.ref.length)}\nAt ${ctx.scope.ref.fn}:${ctx.scope.ref.ln+1}:${ctx.scope.ref.cn+1}`);
                    this.call_stack.pop();
                    this.stack.push(v);
                }
                else if (ctx.scope.reftype == 'string') {
                    debug('  STRING');
                    this.call_stack.pop();
                    this.stack.push(new Types.String(ctx.scope.ref));
                }
                else if (ctx.scope.reftype == 'number') {
                    debug('  NUMBER');
                    this.call_stack.pop();
                    this.stack.push(new Types.Number(ctx.scope.ref));
                }
                else {
                    return Error(`Unknown reference type '${ctx.scope.reftype}'`);
                }
                //ctx.status = ResolvingContext.RESOLVED;
            }

            else if (ctx.scope.type == 'call') {
                debug('CALL');
                if (ctx.f&1) {
                    debug('  PHASE4');
                    this.globals.pop();
                    this.call_stack.pop();
                } else if (this.stack.length == 0) {
                    debug('  PHASE1');
                    this.call_stack.push(new ResolvingContext(ctx.scope.value));
                } else if (this.stack.length < ctx.scope.children.filter(c=>c.length).length+1) {
                    debug('  PHASE2');
                    this.call_stack.push(new ResolvingContext(ctx.scope.children[this.stack.length-1][0]));
                } else if (this.stack.length < ctx.scope.children.filter(c=>c.length).length+2) {
                    debug('  PHASE3');
                    debug(this.stack);
                    let [fn,...args] = this.stack.splice(-ctx.scope.children.filter(c=>c.length).length-1);
                    if (fn && fn.value != undefined) fn = fn.value;
                    debug(this.stack);
                    if (fn.type == 'function') {
                        let f = fn.implementations[0];
                        fn = new Types.Function(f.code,f.args);
                    }
                    debug(fn);
                    if (!fn) {
                        return Error('Unresolved callable value');
                    }
                    if (!(fn.__call__ instanceof Function)) {
                        console.log(ctx);
                        return Error(`Attempt to call non-callable value '${ctx.scope.value.__t}'\n  ${ctx.scope.value.__t.l}\n${' '.repeat(ctx.scope.value.__t.cn+2)}${'^'.repeat(ctx.scope.value.__t.length)}\nAt ${ctx.scope.value.__t.fn}:${ctx.scope.value.__t.ln+1}:${ctx.scope.value.__t.cn+1}`);
                    }
                    let newArgs = args.map(cloneVar);
                    this.globals.push(
                        Object.fromEntries(
                            Array.isArray(fn.__dat.args) ? fn.__dat.args.map((a,i)=>[a.name.toString(),newArgs[i]]) : []
                        )
                    );
                    fn.__call__(this,newArgs);
                    ctx.f |= 1;
                }
            }

            else if (ctx.scope.type == 'assign') {
                debug('SET');
                if (this.stack.length == 0) {
                    debug('  PHASE1');
                    if (ctx.scope.name.type!='ref' || ctx.scope.name.reftype!='name')
                        return Error(`Invalid left-side operand for assignment`);
                    this.call_stack.push(new ResolvingContext(ctx.scope.children[0][0]));
                } else {
                    debug('  PHASE2');
                    let ref  = ctx.scope.name.ref;
                    let name = ref.toString();
                    let vars = this.getVars();
                    if (vars[name] == undefined)
                        return Error(`Unknown reference '${name}'\n  ${ref.l}\n${' '.repeat(ref.cn+2)}${'^'.repeat(ref.length)}\nAt ${ref.fn}:${ref.ln+1}:${ref.cn+1}`);
                    vars[name].value = this.stack.splice(0)[0];
                    this.call_stack.pop();
                }
            }

            else if (ctx.scope.type == 'var') {
                debug('VAR');
                for (let v of ctx.scope.buffer) {
                    if (v.type != 'ref')
                        return Error(`Invalid var argument`);
                    if (v.reftype != 'name')
                        return Error(`Invalid var reference type '${v.reftype}'\n  ${v.ref.l}\n${' '.repeat(v.ref.cn+2)}${'^'.repeat(v.ref.length)}`);
                    if (this.globals.at(-1)[v.ref.toString()] != undefined) 
                        return Error(`Variable already delcared in this scope\n  ${v.ref.l}\n${' '.repeat(v.ref.cn+2)}${'^'.repeat(v.ref.length)}`);
                    this.globals.at(-1)[v.ref.toString()] = {value:new Types.Void()};
                }
                this.call_stack.pop();
            }

            else {
                return Error(`Unknown instruction type '${ctx.scope.type}'`);
            }
        
        }

        // ------ higher level stuff ------ \\

        if (ctx instanceof RunningContext) {

            let thisScope = ctx.scope[ctx.i];
            this.stack = [];
         
            if (!thisScope) {
                this.call_stack.pop();
                return;
            }
            if (!this.call_stack.length) return 'END';

            if (thisScope.length > 1) { // more than 1 instruction on one "line", meaning that they haven't been separated properly, likely a missing ';'
                ctx.i = Infinity;
                return Error(`Invalid syntax: unexpected token '${thisScope[1].__t.toString()}'\n  ${thisScope[1].__t.l}\n${' '.repeat(thisScope[1].__t.cn+2)}${'^'.repeat(thisScope[1].__t.length)}\nAt ${thisScope[1].__t.fn}:${thisScope[1].__t.ln+1}:${thisScope[1].__t.cn+1}`);
            }

            this.call_stack.push(new ResolvingContext(thisScope[0]));

            ctx.i++;
            
        }
    }

}

/**
 * Represents any token
 */
class Token extends String {

    /**
     * @param {string|*} value the value of the token (most likely a string)
     * @param {number} ln the line the token is located at
     * @param {number} cn the column the character is located at
     * @param {string} fn the name of the file containing the token
     * @param {string} l the whole line of the token
     */
    constructor ( value, ln,cn,fn,l ) {
        super ( value );

        /** @type {number} the line the token was created at */
        this.ln = ln;
        /** @type {string} the file the token was created at */
        this.fn = fn;
        /** @type {number} the column the token was created at */
        this.cn = cn;

        /** @type {string} the whole line containing the token */
        this.l = l;
    }

    static from( v,t ) {
        return new this( v, t.ln,t.cn,t.fn,t.l );
    }

}

/**
 * Creates tokens from the provided piece of code
 * @param {string} code the code to tokenize
 * @returns {Token[]}
 */
function tokenize(code,fn) {
    code = code.replace(/\r/g,'');
    let tokens = [];

    let tk = '';
    let s = 0;
    let comm = false;
    for (let c of code) {
        if (s) s--;
        if (c == '\\')
            s = 2;
        tk += c;
        if (c == '\n') {
            tokens.push(tk.slice(0,-1));
            tokens.push(c);
            tk = '';
            comm = false;
        }
        if (comm) continue;
        if (!tk.startsWith('"') && '!:;.,()[]{}|*/-+=<>%$^#& '.includes(c)) {
            let l = tokens.at(-1)+tk;
            //console.log(l);
            if (['==','>=','<=','!=','->'].includes(l)) {
                tokens = tokens.slice(0,-1);
                tokens.push(l);
                tk = '';
            } else if (l == '//') {
                comm = true;
            } else {
                tokens.push(tk.slice(0,-1));
                tokens.push(c);
                tk = '';
            }
        }
        if (c == ' ' && !tk.startsWith('"') && !tk.startsWith('\'')) {
            tokens.push(tk);
            tk = '';
        }
        if (!s) if (c == '"' && tk.charAt(0) == '"' && tk.length>1) {
            tokens.push(tk);
            tk = '';
        }
        if (!s) if (c == '\'' && tk.charAt(0) == '\'' && tk.length>1) {
            tokens.push(tk);
            tk = '';
        }
    }
    if (tk) tokens.push(tk);

    let cn = 0;
    let ln = 0;

    let lines = [''];
    for (let t of tokens) {
        if (t == '\n') lines.push('');
        else lines[lines.length-1] += t;
    }

    tokens = tokens.map(
        t => [
            new Token( t, ln,cn, fn, lines[ln] ),
            ( t == '\n' ? [cn=0,ln++] : (cn+=t.length) )
        ][0]
    );

    {   // post-processes the tokens for easier parsing
        let ntokens = [];

        for (let t of tokens) {
            if (t == '\n') {
                ntokens.push(t);
            }
            else if (t.match(/^ +$/g)) {
                if (!(ntokens.at(-1)??'').match(/^ +$/g))
                    ntokens.push('');
                ntokens[ntokens.length-1] = Token.from(ntokens[ntokens.length-1] + t, t);
            } else 
                if (t.length) ntokens.push(t);
        }

        tokens = ntokens;
    }

    return tokens;
}

const error = {
    Syntax : function SyntaxError () {

    }
}

///const filepath = process.argv[2] || 'main.tccl';

function generateAST(source,filename='') {

    // tokenization

    const tokens = 
        tokenize(source,filename)
        .filter( t => t.trim().length );

    // "AST" generation

    let scope = {
        __t: null,
        type : 'block',
        buffer: [],
        children: [],
        parent: null,
    }
    scope.parent = scope;

    let idx = null;

    for (let ti in tokens) {
        let token = tokens[ti];

        if (idx != null) {
            scope.buffer.push({
                __t: token,
                type: 'index',
                value: idx,
                buffer: [],
                children: [ [ {type:'ref',reftype:'string',ref:`"${token}"`} ] ],
                parent: scope
            });
            //* console.log(scope.buffer);
            idx = null;
            continue;
        }

        if (token.match(/^[\w]+$/)&&!token[0].match(/\d/)&&!['if','fn','while','return','var','loop'].includes(token.toString())) {
            scope.buffer.push({
                __t: token,
                type : 'ref',
                reftype : 'name',
                ref: token
            });
        }
        if (token.match(/^\d+$/)) {
            scope.buffer.push({
                __t: token,
                type : 'ref',
                reftype : 'number',
                ref: token
            });
        }
        if (token.match(/^".*"$/)) {
            scope.buffer.push({
                __t: token,
                type : 'ref',
                reftype : 'string',
                ref: token
            });
        }

        if (token == '=') {
            let ns = {
                __t: token,
                type : 'assign',
                name : scope.buffer.splice(-1,1)[0],
                buffer: [],
                children: [],
                parent: scope,
            }
            scope.buffer.push(ns);
            scope = ns;
        }

        if (
            [
                '+', '-', '*', '/', '%',
                '^', '&', '|', '!',
                '==','>=','<=','!='
            ].includes(token.toString())
        ) {

            /*if (token == '+' && scope.buffer.length == 0) {

            }

            else if (token == '-' && scope.buffer.length == 0) {

            }

            else*/ if (token == '*' && scope.buffer.length == 1) {
                let s = {
                    __t: token,
                    type: 'star',
                    value: scope.buffer.splice(-1,1)[0],
                }
                scope.buffer.push(s);
            }

            else {

                let ns = {
                    __t: token,
                    type: 'operator',
                    optype: token.toString(),
                    buffer: [scope.buffer.splice(-1,1)[0]],
                    parent: scope.type == 'operator' ? scope.parent : scope
                }
                scope.buffer.push(ns);
                scope = ns;

            }
        }

        if (token == ',') {
            if (scope.type == 'call') {
                scope.children.push(scope.buffer.splice(0));
            }

            else if (scope.type == 'if.args') {
                scope.children.push(scope.buffer.splice(0));
            }

            else if (scope.type == 'ref' && scope.reftype == 'list') {
                scope.ref.push(scope.buffer.splice(0));
            }
        }

        if (token == '.') {
            idx = scope.buffer.splice(-1)[0];
            //console.log(idx);
        }

        if (token == ';') {
            if (scope.type == 'assign') {
                scope.children.push(scope.buffer.splice(0));
            }
            if (scope.type != 'block') {
                scope = scope.parent;
            }
            scope.children.push(scope.buffer.splice(0));
        }

        if (token == 'if') {
            let ns = {
                __t: token,
                type : 'if',
                buffer: [],
                children: [],
                parent: scope,
            }
            scope.buffer.push(ns);
            scope = ns;
        } 

        if (token == 'fn') {
            let ns = {
                __t: token,
                type : 'fn',
                buffer: [],
                children: [],
                parent: scope,
            }
            scope.buffer.push(ns);
            scope = ns;
        }

        if (token == 'while') {
            let ns = {
                __t: token,
                type : 'while',
                buffer: [],
                children: [],
                parent: scope,
            }
            scope.buffer.push(ns);
            scope = ns;
        }

        if (token == 'loop') {
            let ns = {
                __t: token,
                type : 'loop',
                buffer: [],
                children: [],
                parent: scope,
            }
            scope.buffer.push(ns);
            scope = ns;
        }

        if (token == '(') {

            if (scope.type == 'if') {

                let ns = {
                    __t: token,
                    type : 'if.condition',
                    buffer: [],
                    children: [],
                    parent: scope,
                }
                scope.buffer.push(ns);
                scope = ns;

            } 
            
            else if (scope.type == 'fn') {

                let ns = {
                    __t: token,
                    type: 'fn.args',
                    buffer: [],
                    children: [],
                    parent: scope
                }
                scope.buffer.push(ns);
                scope = ns;

            }

            else if (scope.type == 'while') {

                let ns = {
                    __t: token,
                    type : 'while.condition',
                    buffer: [],
                    children: [],
                    parent: scope,
                }
                scope.buffer.push(ns);
                scope = ns;

            }
            
            else {

                let ns = {
                    __t: token,
                    type : 'call',
                    value : scope.buffer.splice(-1,1)[0],
                    buffer: [],
                    children: [],
                    parent: scope,
                }
                scope.buffer.push(ns);
                scope = ns;

            }

        }
        if (token == ')') {

            if (scope.type == 'if.condition') {

                scope.children.push(scope.buffer.splice(0));
                scope = scope.parent;
                scope.children.push(scope.buffer.splice(0));

            }

            else if (scope.type == 'fn.args') {

                if (scope.buffer.length) scope.children.push(scope.buffer.splice(0));
                scope = scope.parent;
                scope.children.push(scope.buffer.splice(0));

            }

            else if (scope.type == 'while.condition') {

                scope.children.push(scope.buffer.splice(0));
                scope = scope.parent;
                scope.children.push(scope.buffer.splice(0));

            }
            
            else if (scope.type == 'call') {
                scope.children.push(scope.buffer.splice(0));
                scope = scope.parent;
            }

        }

        if (token == '[') {
            let ns;
            if (scope.buffer.length) {
                ns = {
                    __t: token,
                    type : 'index',
                    value : scope.buffer.splice(-1,1)[0],
                    buffer: [],
                    children: [],
                    parent: scope,
                }
            } else {
                ns = {
                    __t: token,
                    type : 'ref',
                    reftype : 'list',
                    ref : [],
                    parent : scope
                }
            }
            scope.buffer.push(ns);
            scope = ns;
        }
        if (token == ']') {
            if (scope.type == 'index') {
                scope.children.push(scope.buffer.splice(0));
                scope = scope.parent;
            }
            if (scope.type == 'ref' && scope.reftype == 'list') {
                scope.children.push(scope.buffer.splice(0));
                scope = scope.parent;
            }
        }

        if (token == '{') {

            let ns = {
                __t: token,
                type : 'block',
                buffer: [],
                children: [],
                parent: scope
            }
            scope.buffer.push(ns);
            scope = ns;


        }

        if (token == '}') {
            if (scope.type == 'block') {
                scope = scope.parent;
            }
            if (
                [
                    'if', 'fn', 'while', 'loop'
                ].includes(scope.type)
            ) {
                scope.children.push(scope.buffer.splice(0));
                scope = scope.parent;
                scope.children.push(scope.buffer.splice(0));
            }
        }

        if (token == '<') {
            let ns = {
                __t: token,
                type : 'generic',
                value : scope.buffer.splice(-1,1)[0],
                buffer : [],
                children : [],
                parent : scope
            }
            scope.buffer.push(ns);
            scope = ns;
        }

        if (token == '>') {
            scope = scope.parent;
        }

        if (token == 'var') {
            let ns = {
                __t: token,
                type : 'var',
                buffer: [],
                children: [],
                parent: scope
            }
            scope.buffer.push(ns);
            scope = ns;
        }

        if (token == 'return') {
            let ns = {
                __t: token,
                type : 'return',
                buffer: [],
                children: [],
                parent: scope
            }
            scope.buffer.push(ns);
            scope = ns;
        }

        if (token == 'break') {
            let ns = {
                __t: token,
                type : 'break',
                buffer: [],
                children: [],
                parent: scope
            }
            scope.buffer.push(ns);
            scope = ns;
        }

    }

    while (scope != scope.parent) {
        scope = scope.parent;
    }

    return scope;

}

function evaluate(ev) {

    let e = ev[0];

    if (e.type == 'ref') {
        switch (e.reftype) {
            case 'number':
                return {type:'number', value:Number.parseFloat(e.ref)};
            case 'string':
                return {type:'string', value:e.ref.slice(1,-1)};
            case 'name':
                return vars[e.ref];
        }
    }

    if (e.type == 'call') {
        let fn = vars[e.value.ref];
        if (fn.type == 'function') {
            if (typeof fn.exec == 'function') {
                return fn.exec(e.children.map(c=>evaluate(c)));
            }
        }
    }

}

function execute(scope) {

    for (let i of scope.children) {
        let instr = i[0];

        if (
            [
                'fn', 'while', 'if'
            ].includes(instr.type)
        ) {

        }

        else if (instr.type == 'assign') {
            let v = evaluate(instr.children[0]);
            vars[instr.name.ref] = v;
            //* console.log(`SET ${instr.name.ref} TO (${v.type}) ${v.value}`);
        }

        else {
            evaluate(i);
        }

    }

}

function run(code,filename='') {
    let AST = generateAST(code,filename);
    //console.log(AST);
    return execute(AST);
}

function getGlobals(scope,g={}) {
    for (let instr of Array.isArray(scope) ? scope : scope.children) {
        if (Array.isArray(instr))
            g = getGlobals(instr,g);
        if (instr.type == 'fn') {
            //console.log(instr.children);
            //console.log('GOT IMPL');
            let fname_ = instr.children[0][instr.children.length == 2 ? 0 : 1];
            let fname;
            if (fname_.type == 'generic')
                fname = fname_.value.ref;
            if (fname_.type == 'ref')
                fname = fname_.ref;
            if (!g[fname]) 
                g[fname] = { // can't use ??= cuz jshint isn't happy about that
                    type: 'function',
                    implementations: []
                }
            g[fname].implementations.push(
                {
                    args: instr.children[0].find(c=>c.type=='fn.args').children.map(a=>a.length==1?({type:null,name:a[0].ref}):({type:a[0].ref,name:a[1].ref})),
                    args_generic: 
                        fname_.type == 'generic' ?
                            fname_.buffer.reduce((acc,v)=>(acc.at(-1).length>=2?acc.push([]):null,acc.at(-1).push(v),acc),[[]]).map(a=>({type:a[0].ref,name:a[1].ref}))
                            : [],
                    code: instr.children[1][0]
                }
            );
        }
    }
    return g;
}

module.exports = {
    tokenize,generateAST,
    run, execute, evaluate,
    getGlobals,
    Runner, Token
};

//*console.log(
//*    util.inspect(
//*        scope,
//*        {
//*            colors: true,
//*            depth: 50
//*        }
//*    )
//*);