![Logo](https://s3-eu-west-1.amazonaws.com/org.paraio/para.png)

# Para Command-Line Interface (CLI)

[![NPM version][npm-image]][npm-url]
[![Join the chat at https://gitter.im/Erudika/para](https://badges.gitter.im/Erudika/para.svg)](https://gitter.im/Erudika/para?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## What is this?

**Para** was designed as a simple and modular backend framework for object persistence and retrieval.
It helps you build applications faster by taking care of the backend. It works on three levels -
objects are stored in a NoSQL data store or any old relational database, then automatically indexed
by a search engine and finally, cached.

This is the command-line tool for interacting with a Para server.

## Installation

```sh
$ npm install -g para-cli
$ para-cli setup
```

## Usage

```
                                 ________    ____
      ____  ____ __________ _   / ____/ /   /  _/
     / __ \/ __ `/ ___/ __ `/  / /   / /    / /
    / /_/ / /_/ / /  / /_/ /  / /___/ /____/ /
   / .___/\__,_/_/   \__,_/   \____/_____/___/
  /_/

  Command-line tool for Para backend servers

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

```

The tool supports basic CRUD operations on files and can also generate JWT 'super tokens' or new secret keys for your app.
You can use the CLI to upload multiple files, like blog posts, for example. The files can be HTML, text or JSON.

The plan is to add more functionality in the near future.

## Configuration

**Quick start:**
```
$ para-cli setup
```

The configuration file is located in `~/.config/para-cli-nodejs/config.json` and contains the keys used to authenticate
with a Para server. The properties `accessKey`, `secretKey` and `endpoint` can be passed as arguments or loaded from the
config file. Also you can choose to set the environment variables `PARA_ACCESS_KEY`, `PARA_SECRET_KEY` and `PARA_ENDPOINT`.
The command-line arguments take precedence over environment variables, and if those are missing we read from `config.json`.

Here's an example `config.json` file:
```
{
  "accessKey": "app:para",
  "secretKey": "abc231234ufnX85123o1few==",
  "endpoint": "http://localhost:8080"
}
```

Once configured you can test your connection to the server:

```
$ para-cli ping
```

To get the currently authenticated app/user object run:
```
$ para-cli me
```

## Para Docs

### [Read the Docs](https://paraio.org/docs)

## Contributing

1. Fork this repository and clone the fork to your machine
2. Create a branch (`git checkout -b my-new-feature`)
3. Implement a new feature or fix a bug and add some tests
4. Commit your changes (`git commit -am 'Added a new feature'`)
5. Push the branch to **your fork** on GitHub (`git push origin my-new-feature`)
6. Create new Pull Request from your fork

For more information see [CONTRIBUTING.md](https://github.com/Erudika/para/blob/master/CONTRIBUTING.md)

## License
[Apache 2.0](LICENSE)


[npm-image]: https://badge.fury.io/js/para-cli.svg
[npm-url]: https://npmjs.org/package/para-cli
[travis-image]: https://travis-ci.org/Erudika/para-cli.svg?branch=master
[travis-url]: https://travis-ci.org/Erudika/para-cli
[daviddm-image]: https://david-dm.org/Erudika/para-cli.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/Erudika/para-cli
