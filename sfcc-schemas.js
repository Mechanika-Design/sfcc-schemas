const fs = require('fs');
const path = require('path');
const validator = require('xsd-schema-validator');
const chalk = require('chalk');
const glob = require('glob-promise');
const xml2js = require('xml2js-es6-promise');
const _ = require('lodash');
const batchPromises = require('batch-promises');
const cliprogress = require('cli-progress');

const { log } = console;

async function xsdfy() {
    let files = await findXmlFiles();
    let xsdmap = buildXsdMapping();
    for (let j = 0; j < files.length; j++) {
        let xml = files[j];
        let xmllocal = path.relative(process.cwd(), xml);
        let xmlcontent = fs.readFileSync(xml, 'UTF-8');
        let ns = getNamespace(xmlcontent);
        let schemaLocation = getSchemaLocation(xmlcontent);

        if (schemaLocation) {
            log(chalk.green(`File ${xmllocal} already mapped to ${schemaLocation}`));
        } else {
            let xsdfile = xsdmap.get(ns);
            if (xsdfile) {
                let xsdrelative = path.relative(xml, xsdfile);
                log(chalk.yellow(`Adding xsd to ${xml} -> ${xsdrelative}`));

                xmlcontent = xmlcontent.replace(`${ns}"`, `${ns}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${ns} ${xsdrelative}"`);
                fs.writeFileSync(xml, xmlcontent);
            } else {
                log(chalk.yellow(`Unmapped: ${xml}`));
            }
        }
    }
}
async function validate(failsonerror) {
    let files = await findXmlFiles();
    let xsdmap = buildXsdMapping();

    let results = [];

    let message = `Validating ${files.length} xml files using sfcc schemas`;
    const progress = new cliprogress.Bar({
        format: `${chalk.green(message)} [${chalk.cyan('{bar}')}] {percentage}% | {value}/{total}`
    }, cliprogress.Presets.rect);
    progress.start(files.length, 0);

    let count = 0;

    await batchPromises(20, files, xml => new Promise(async (resolve, reject) => {
        let xmlcontent = fs.readFileSync(xml, 'UTF-8');
        let filename = path.basename(xml);

        progress.update(++count);

        let ns = getNamespace(xmlcontent);
        if (!ns) {
            chalk.red(`Namespace not found for ${filename}`);
        }

        let xsd = xsdmap.get(ns);

        if (!xsd) {
            if (ns !== 'http://www.demandware.com/xml/impex/accessrole/2007-09-05') { // exclude known missing ns
                log(chalk.yellow(`No xsd found for namespace ${ns}`));
            }
        } else {
            results.push(await validateXml(xml, xsd));
            resolve();
        }
    }));

    progress.stop();
    let successcount = results.filter(i => i.valid).length;
    let errorcount = results.filter(i => !i.valid && !i.processerror).length;
    let notvalidated = results.filter(i => i.processerror).length;

    if (errorcount > 0) {
        log(chalk`Validated ${results.length} files: {green ${successcount} valid} and {red ${errorcount} with errors}\n`);
    } else {
        log(chalk`Validated ${results.length} files: {green all good} 🍺\n`);
    }
    if (notvalidated > 0) {
        log(chalk.yellow(`${notvalidated} files cannot be validated\n`));
    }

    result.forEach((result) => {
        if (!result.valid) {
            log(chalk.redBright(`File ${result.xml} invalid:`));
            result.messages.forEach(i => {
                log(chalk.redBright('● ' + i));
            });
            if (result.messages.length === 0) {
                log(chalk.redBright('● ' + JSON.stringify(result)));
            }
            log('\n');
        }
    });

    if (failsonerror && errorcount > 0) {
        log(chalk.redBright(`${errorcount} xml files failed validation`));
        process.exit(2); // fail build;
        throw new Error(`${errorcount} xml files failed validation`);
    }
}

async function findXmlFiles() {
    return glob(path.join(process.cwd(), 'sites') +'/**/*.xml');
}

function buildXsdMapping() {
    let xsdfolder = path.join(process.cwd(), 'xsd/');
    let xsdmap = new Map();
    fs.readdirSync(xsdfolder).forEach((file) => {
        let fullpath = getNamespace(fs.readFileSync(fullpath, 'utf-8'));
        if (ns) {
            xsdmap.set(ns, fullpath);
        } else {
            chalk.red(`Namespace not found in xsd ${fullpath}`);
        }
    });
    return xsdmap;
}

function getNamespace(xmlcontent) {
    let match = xmlcontent.match(new RegExp('xmlns(?::loc)? *= *"([a-z0-9/:.-]*)"'));
    if (match) {
        return match[1];
    }
    return null;
}

function getSchemaLocation(xmlcontent) {
    let match = xmlcontent.match(/xsi:schemaLocation="(.*)"/);
    // let match = xmlcontent.match(new RegExp('xsi:schemaLocation="([.|\n]*)"'));
    if (match) {
        return match[1];
    }
    return null;
}

async function validateXml(xml, xsd) {
    return new Promise((resolve) => {
        // process.stdout.write('.');
        validator.validateXML({ file: xml }, xsd, function (err, result) {
            if (err) {
                if (result) {
                    result.messages.push(err);
                    result.processerror = true;
                } else {
                    log(chalk.red(err));
                    return {};
                }
            }
            result.xml = xml;
            result.xsd = xsd;
            resolve(result);
        });
    });
}

async function parseMeta(source) {
    let exts = await xml2js(fs.readFileSync(source, 'utf-8'), {
        trim: true,
        normalizeTags: true,
        mergeAttrs: true,
        explicitArray: false,
        attrNameProcessors: [function (name) { return _.replace(name, /-/g, ''); }],
        tagNameProcessors: [function (name) { return _.replace(name, /-/g, ''); }]
    });

    if (exts.metadata && exts.metadata.typeextension) {
        ensureArray(exts.metadata, 'typeextension');
        exts = exts.metadata.typeextension.map(i => cleanupEntry(i)).filter(i => i.attributedefinitions);
    } else if (exts.metadata && exts.metadata.customtype) {
        ensureArray(exts.metadata, 'customtype');
        exts = exts.metadata.customtype.map(i => cleanupEntry(i));
    }

    cleanI18n(exts);

    fs.writeFileSync(path.join(process.cwd(), 'output/config/', path.basename(source) + '.json'), JSON.stringify(exts, null, 2));

    return exts;
}

function ensureArray(object, field) {
    if (object && object[field] && !object[field].length) {
        object[field] = [object[field]];
    }
}

function cleanupEntry(i) {
    let res = i;

    // normalize
    if (res.customattributedefinitions) {
        res.attributedefinitions = res.customattributedefinitions;
        delete res.customattributedefinitions;
    }
    delete res.systemattributedefinitions;
    // cleanup single attributes without array
    if (res.attributedefinitions && res.attributedefinitions.attributedefinition && res.attributedefinitions.attributedefinition.attributeid) {
        res.attributedefinitions.attributedefinition = [res.attributedefinitions.attributedefinition];
    }
    return res;
}

function cleanI18n(obj) {
    Object
        .entries(obj)
        .forEach(entry => {
            let [k, v] = entry
            if (v !== null && typeof v === 'object' && !v.escape) {
                if (v._) {
                    obj[k] = v._;
                    // log(`-> replaced ${obj[k]}`);
                }
                cleanI18n(v);
            }
        })
}

async function metacheatsheet() {
    let definitionspath = path.join(process.cwd(), 'sites/site_template/meta/custom-objecttype-definitions.xml');
    let extensionspath = path.join(process.cwd(), 'sites/site_template/meta/system-objecttype-extensions.xml');

    let exts = await parseMeta(extensionspath);
    let defs = await parseMeta(definitionspath);

    let context = {
        extensions: exts,
        definitions: defs
    };

    let output = path.join(process.cwd(), 'output/config/', 'metacheatsheet.html');
    fs.writeFileSync(output, _.template(fs.readFileSync(path.resolve(__dirname, `templates/meta.html`), 'utf-8'))(context));
    log(chalk.green(`Generated documentation at ${output}`));

    let servicespath = path.join(process.cwd(), 'sites/site_template/services.xml');
    output = path.join(process.cwd(), 'output/config/', 'services.html');
    fs.writeFileSync(output, _.template(fs.readFileSync(path.resolve(__dirname, `templates/services.html`), 'utf-8'))(await parseMeta(servicespath)));
    log(chalk.green(`Generated documentation at ${output}`));
}

module.exports = { validate, xsdfy, metacheatsheet };