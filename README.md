# SFCC-Schemas


> Salesforce Commerce Cloud import and export schemas validator
## Features

* validate salesforce commerce cloud import/export xml files
* automatically add local xsd declarations to xml files for leveraging IDE autocomplete and validation

## Installation

Warning: the module makes use of [xsd-schema-validator](https://www.npmjs.com/package/xsd-schema-validator) which requires java.

See the prerequisites section on https://www.npmjs.com/package/xsd-schema-validator for details.

## Requirements
* Node >= 10

## Usage

```bash
sfcc-schemas-validate
```
Validates all the xml files in the `sites` subdirectory (following the usual cartridge folder conventions)

```bash
sfcc-schemas-xsdify
```
Adds a schemaLocation attribute to all the xml files, in order to leverage editor support (validation or autocompletion) ini your IDE.

For this purpose the module must be installed locally in your project so that xsds can be linked directly from the node_modules folder, e.g.

```xml
<preferences xmlns="http://www.demandware.com/xml/impex/preferences/2007-03-31" 
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.demandware.com/xml/impex/preferences/2007-03-31 ../../../../sfcc-schemas/xsd/preferences.xsd">
    ...
```

## License

Copyright (c) 2020-2021 Warren Galyen

Released under the MIT license.
