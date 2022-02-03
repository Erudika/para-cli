#!/usr/bin/env node

/*
 * Copyright 2013-2022 Erudika. https://erudika.com
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * For issues and patches go to: https://github.com/erudika
 */

/* eslint indent: ["error", "tab"] */
/* eslint object-curly-spacing: ["error", "always"] */

import updateNotifier from 'update-notifier';
import ParaClient from 'para-client-js';
import Conf from 'conf';
import figlet from 'figlet';
import chalk from 'chalk';
import meow from 'meow';
import { defaultConfig, setup, createAll, readAll, updateAll, deleteAll, search, newKeys, newJWT, newApp, ping, me, appSettings, rebuildIndex, exportData, importData } from './index.js';

const { blue } = chalk;
const { textSync } = figlet;

var cli = meow(`
	Usage:
	  $ para-cli [command] [file]

	Commands:
	  setup                                  Initial setup, prompts you to enter your Para API keys and endpoint
	  create <file|glob> [--id] [--type]     Persists files as Para objects and makes them searchable
	  read --id 123 [--id 345 ...]           Fetches objects with the given ids
	  update <file.json|glob> ...            Updates Para objects with the data from a JSON file (must contain id field)
	  delete [glob] --id 123 ...             Deletes one or more objects from Para
	  search "query" [--limit --page --sort] Searches the Para index for objects given a query string
	  rebuild-index                          Rebuilds the entire search index
	  app-settings                           Returns all settings for the authenticated app
	  new-key                                Generates a new secret key and saves it to config.json
	  new-jwt                                Generates a new JWT super token to be used for app authentication
	  new-app <name> --name --shared         Creates a new Para app. Only works if you have the keys for the "root" app
	  export                                 Exports all data from the app's table
	  import <file>                          Imports data from a previously exported ZIP archive
	  ping                                   Tests the connection to the Para server
	  me                                     Returns the JSON for the currently authenticated user or app

	Options:
	  --type          Sets the "type" field of an object
	  --id            Sets the "id" field of an object
	  --sanitize      Strips all symbols from input files
	  --accessKey     Sets the Para access key
	  --secretKey     Sets the Para secret key
	  --endpoint      Sets the URL of the Para server
	  --sort          Sets the field on which to sort search results
	  --desc          Descending sort for search results (default: true)
	  --page          Page number for search results, "all" will auto-paginate through all results
	  --limit         Limits the number of search results
	  --lastKey       Sets the last id for search-after pagination
	  --cwd           Sets the current directory - used for resolving file paths
	  --encodeId      By default all ids are Base64 encoded, unless this is 'false'
	  --help          Prints the list of commands
	  --version       Prints the version of the program

	Examples:
	  $ para-cli setup
	  $ para-cli create my-blog-post.md
	  $ para-cli read --id my-blog-post.md
	  $ para-cli create index.html --type webpage --id "My new article" --sanitize
	  $ para-cli delete --id 123 --id "my-blog-post.md"
	  $ para-cli search "type:article AND title:*" --sort timestamp --desc false --limit 10
	  $ para-cli search "*" --type article --page all
	  $ para-cli new-key
	  $ para-cli new-app "mynewapp" --name "Full app name"

`, {
	importMeta: import.meta,
	flags: {
		id: {
			type: 'string'
		}
	}
});

updateNotifier({ pkg: cli.pkg }).notify();

var config = new Conf({
	projectName: 'para-cli',
	defaults: defaultConfig
});

var logo = blue(textSync(' para CLI', { font: 'Slant' })) + '\n';
var help = logo + cli.help;
var input = cli.input;
var flags = cli.flags;
var accessKey = flags.accessKey || process.env.PARA_ACCESS_KEY || config.get('accessKey');
var secretKey = flags.secretKey || process.env.PARA_SECRET_KEY || config.get('secretKey');
var endpoint = flags.endpoint || process.env.PARA_ENDPOINT || config.get('endpoint');
var pc = new ParaClient(accessKey, secretKey, { endpoint: endpoint });

if (!input[0]) {
	console.log(help);
}

if (input[0] === 'setup') {
	setup(config);
}

if (input[0] === 'create') {
	createAll(pc, input, flags);
}

if (input[0] === 'read') {
	readAll(pc, flags);
}

if (input[0] === 'update') {
	updateAll(pc, input, flags);
}

if (input[0] === 'delete') {
	deleteAll(pc, input, flags);
}

if (input[0] === 'search') {
	search(pc, input, flags);
}

if (input[0] === 'new-key') {
	newKeys(pc, config);
}

if (input[0] === 'new-jwt') {
	newJWT(accessKey, secretKey, endpoint, config);
}

if (input[0] === 'new-app') {
	newApp(pc, input, flags);
}

if (input[0] === 'ping') {
	ping(pc, config);
}

if (input[0] === 'me') {
	me(pc, config);
}

if (input[0] === 'app-settings') {
	appSettings(pc, config);
}

if (input[0] === 'rebuild-index') {
	rebuildIndex(pc, config, flags);
}

if (input[0] === 'export') {
	exportData(pc, config, flags);
}

if (input[0] === 'import') {
	importData(pc, input, config);
}
