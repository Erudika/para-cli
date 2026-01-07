#!/usr/bin/env node

/*
 * Copyright 2013-2026 Erudika. https://erudika.com
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
import {
	defaultConfig, setup, listApps, parseEndpoint, selectEndpoint, addEndpoint, removeEndpoint,
	selectApp, createAll, readAll, updateAll, deleteAll, search, newKeys, newJWT, newApp, deleteApp,
	ping, me, appSettings, rebuildIndex, exportData, importData, types
} from './index.js';

const { red, green, blue } = chalk;
const { textSync } = figlet;

var cli = meow(`
	Usage:
	  $ para-cli [command] [file]

	Commands:
	  setup                                  Initial setup, prompts you to enter your Para API keys and endpoint
	  apps                                   Returns a list of all Para apps
	  types                                  Returns an object containing all currently defined data types in Para
	  select <appid>                         Selects a Para app as a target for all subsequent read/write requests
	  endpoints [add|remove]                 List and select Para server endpoints, add new or remove an exiting one
	  create <file|glob> [--id] [--type]     Persists files as Para objects and makes them searchable
	  read --id 123 [--id 345 ...]           Fetches objects with the given ids
	  update <file.json|glob> ...            Updates Para objects with the data from a JSON file (must contain id field)
	  delete [glob] --id 123 ...             Deletes one or more objects from Para
	  search "query" [--limit --page --sort] Searches the Para index for objects given a query string
	  rebuild-index                          Rebuilds the entire search index
	  app-settings                           Returns all settings for the authenticated app
	  new-key                                Generates a new secret key and saves it to config.json
	  new-jwt                                Generates a new JWT super token to be used for app authentication (use --print for console output)
	  new-app <name> --name --shared         Creates a new Para app (only works if you have the keys for the "root" app)
	  delete-app <id>                        Deletes an existing Para app (only works for child apps, not the "root" app)
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
	  --encodeId      By default all ids are Base64 encoded, unless this is set to 'false'
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
	  $ para-cli new-jwt --print
	  $ para-cli apps
	  $ para-cli types
	  $ para-cli select scoold
	  $ para-cli endpoints
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
var selectedApp = config.get('selectedApp');

if (!flags.accessKey && !flags.secretKey && selectedApp && selectedApp.accessKey && selectedApp.accessKey.indexOf("app:") === 0) {
	accessKey = selectedApp.accessKey;
	secretKey = selectedApp.secretKey;
	endpoint = selectedApp.endpoint || endpoint;
}

if (!input[0]) {
	console.log(help);
} else if ((!accessKey || !secretKey) && input[0] !== 'setup') {
	console.error(red('Command ' + input[0] + ' failed! Blank credentials, running setup first...'));
	console.log("Please enter the access key and secret key for the root app 'app:para' first.");
	process.exitCode = 1;
	setup(config);
} else {
	var pc = new ParaClient(accessKey, secretKey, parseEndpoint(endpoint));

	if (input[0] === 'setup') {
		setup(config);
	}

	if (input[0] === 'apps') {
		listApps(config, flags, accessKey, function () {console.log('No apps found within', green(accessKey));});
	}

	if (input[0] === 'endpoints') {
		if (input.length > 1 && input[1] === 'add') {
			addEndpoint(config);
		} else if (input.length > 1 && input[1] === 'remove') {
			removeEndpoint(config, flags);
		} else {
			selectEndpoint(config, flags);
		}
	}

	if (input[0] === 'select') {
		selectApp(input, config, flags);
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
		newJWT(accessKey, secretKey, endpoint, config, flags);
	}

	if (input[0] === 'new-app') {
		newApp(pc, input, flags);
	}

	if (input[0] === 'delete-app') {
		deleteApp(pc, input, flags);
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

	if (input[0] === 'types') {
		types(pc, config);
	}
}

