const ns = require('./nugget_script');
const {inspect} = require('node:util');
const fs = require('node:fs');
const path = require('node:path');

(async()=>{

    let source = fs.readFileSync('./main.ns','utf-8');
    let ast = ns.generateAST(source,path.resolve('./main.ns'));

    let runner = new ns.Runner(ast); // creates an instance of the interpreter

    if (runner instanceof ns.Runner) {

        while (true) {

            let res = runner.step(); // steps the execution once, some instructions like function calls would need several of these

            if (res == 'END') { // 'END' is returned when the program exits
                return 0;
            } else if (res instanceof Error) { // if any error is thrown, it is caught and displayed on screen
                console.error(res);
                return res;
            }

        }

    } else {

        console.error(runner);

    }

})();