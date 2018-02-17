#!/usr/bin/env node

"use strict";

/**
 * Module dependencies.
 */

var _ = require('lodash')
var cheerio = require('cheerio')
var CLI = require('clui')
var log = require('../utils/util').log
var program = require('commander')
var qs = require('querystring')
var read = require('../utils/util').read
var request = require('request')
var Table = require('cli-table')

var Spinner = CLI.Spinner
var lowercase = _.memoize(_.lowerCase)
var trim = _.memoize(_.trim)
var intersection = _.memoize(_.intersection)

process.env.INIT_CWD = process.cwd()

/**
 * Initialize a new `Aboki`.
 *
 * @param {String} version
 * @api public
 */

function Aboki(version) {
  if (!(this instanceof Aboki)) {
    return new Aboki(arguments[0])
  }

  this._apiURL = 'https://www.abokifx.com'
  this.version = 'aboki ' + version
  this.currencies = ['usd', 'gbp', 'eur']
  this.types = ['cbn', 'movement', 'lagos_previous', 'moneygram', 'westernunion', 'otherparallel']
  this.quotes = 'Quotes:\t*morning\t**midday\t***evening'
  this.note = '**NOTE**: Buy / Sell => 90 / 100\n'
  this.horizontalTable = new Table({
    head: _.concat(['TIMESTAMP'], _.split(_.upperCase(this.currencies), ' ')),
    style: { compact : true, 'padding-left': 2, 'padding-right': 2 }
  })
  this.verticalTable = new Table({
    style: { compact : true, 'padding-left': 2, 'padding-right': 2 }
  })
}


/**
 * [help]
 * Ouput program examples.
 *
 *
 * @return {null}
 * @api private
 */

Aboki.prototype.help = function() {
  log(read().toString())
}


/**
 * [_makeRequest Make API request]
 * Make the specified API request and return HTML data or quit with an error.
 *
 *
 * @param {string}  path   (required)
 * @param {object}  params (required)
 * @param {object}  data   (optional)
 * @param {string}  method (optional) defaults. 'GET'
 * @return {HTML}
 * @api private
 */

Aboki.prototype._makeRequest = function(opts, callback) {
  var status = new Spinner('Fetching, Please Wait...  ')
  var dumps = {}
  var method, path, params

  if (typeof opts === 'function') {
    callback = opts
  }

  if (typeof opts === 'object') {
    _.extend(dumps, opts)
  }

  method = dumps.method || 'GET'
  path = dumps.path ? '/' + dumps.path : ''
  params = dumps.params ? '?' + qs.stringify(dumps.params) : ''

  var options = {
    url: this._apiURL + path + params,
    method: method,
    form: method == 'GET' ? {} : dumps.data,
    headers: method == 'GET' ? {} : {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': dumps.data.length
    }
  }

  function fn(error, response, body) {
    if (error) {
      status.stop()
      return callback(error)
    }

    if (response.statusCode != 200) {
      log('Error occurred. Please try again.', 'warn')
      log('If the problem persists, please email r@akinjide.me.', 'warn')
      process.exit(1)
    }
    status.stop()
    return callback(null, response.body)
  }

  status.start()
  request(options, fn)
}


/**
 * [_parse]
 * Manipulate and return usable data.
 *
 *
 * @param {HTML}    content  (required)
 * @return {object}
 * @api private
 */

Aboki.prototype._parse = function(content) {
  var $ = cheerio.load(content, { normalizeWhitespace: true })
  var data = []

  $('body')
    .find('.lagos-market-rates table > tr')
    .map(function(i, elem) {
      data[i] = _.words($(this).text(), /(\w+\/\w+\/\w+|\w+\s\/\s\w+\**|\w+\.\w*|\w+)/g)
    })

  _.remove(data, function(value) {
    return _.includes(value, ('NGN' || 'Buy / Sell'))
  })

  return { 'title': $('title').text(), 'data': data }
}


/**
 * [_getCurrentRate]
 * Return the current exchange rate for USD, GBP, EUR.
 *
 *
 * @param {function}  callback (required)
 * @return {object}
 * @api private
 */

Aboki.prototype._getCurrentRate = function(callback) {
  var _this = this

  _this._makeRequest(function(err, content) {
    if (err) {
      log('Oops! Catastrophic Failure', 'error')
      log('If the problem persists, please email r@akinjide.me.', 'error')
      process.exit(1)
    }

    var rjson = _this._parse(content)
    var sep = ' / '
    var rates = _.split(_.join(_.drop(rjson.data[0]), sep), sep)

    callback(null, _.zipObject(_this.currencies, _.map(rates, function(rate, key) {
        return trim(rates[key * 2], '*')
    })))
  })
}


/**
 * [recent]
 * Output Recent Exchange Rates for USD, GBP, EUR
 *
 *
 * @return {null}
 * @api public
 */

Aboki.prototype.recent = function() {
  var _this = this

  _this._makeRequest(function(err, content) {
    if (err) {
      log('Oops! Catastrophic Failure', 'error')
      log('If the problem persists, please email r@akinjide.me.', 'error')
      process.exit(1)
    } else if (_.isEmpty(content)) {
      log('Error connecting. Please check network and try again.', 'warn')
      log('If the problem persists, please email r@akinjide.me.', 'warn')
      process.exit(1)
    } else {
      var rjson = _this._parse(content)

      log(_this.quotes)
      log(_this.note)
      log(rjson.title)
      _.each(rjson.data, function(value, key) {
        _this.horizontalTable.push(value)
      })
      log(_this.horizontalTable.toString())
    }
  })
}


/**
 * [rates List current exchange rates]
 * Supported types: cbn, movement, lagos_previous, moneygram, westernunion
 * and otherparallel.
 *
 *
 * @param {string}  type (optional) defaults. 'cbn'
 * @return {null}
 * @api public
 */

Aboki.prototype.rates = function(type) {
  var _this = this

  _this._makeRequest({ path: 'ratetypes', params: { 'rates': type } }, function(err, content) {
    if (err) {
      log('Oops! Catastrophic Failure', 'error')
      log('If the problem persists, please email r@akinjide.me.', 'error')
      process.exit(1)
    } else if (_.isEmpty(content)) {
      log('Error connecting. Please check network and try again.', 'warn')
      log('If the problem persists, please email r@akinjide.me.', 'warn')
      process.exit(1)
    } else {
      var rjson = _this._parse(content)

      if (intersection([type], ['otherparallel', 'movement']).length) {
        log(_this.quotes)
        log(_this.note)
      } else if (type == 'lagos_previous') {
        log(_this.note)
      }

      log(rjson.title)
      _.each(rjson.data, function(value, key) {
        _this.horizontalTable.push(value)
      })
      log(_this.horizontalTable.toString())
    }
  })
}


/**
 * [rate]
 * List current exchange rate for currency.
 *
 *
 * @param {string}  currency (optional) defaults. 'usd'
 * @param {string}  output  (optional) defaults. 'table'
 * @return {null}
 * @api public
 */

Aboki.prototype.rate = function(currency, output) {
  var _this = this

  _this._getCurrentRate(function(err, rates) {
    var xc = _.pick(rates, currency)

    log(_.upperCase(currency) + ' Exchange Rate')
    switch (output) {
      case 'table':
        _this.verticalTable.push(xc)
        log(_this.verticalTable.toString())
        break;
      case 'json':
        log(JSON.stringify(xc, null, 2), 'log')
        break
      default:
        log(output + '(1) does not exist. try --help or run with --ouput json\n', 'warn')
        process.exit(1)
    }
  })
}


/**
 * [convert]
 * Convert currency with current rate.
 *
 *
 * @param {string}  amount  (required)
 * @param {string}  from    (required)
 * @param {string}  to      (required)
 * @param {string}  output  (optional) defaults. 'table'
 * @return {null}
 * @api public
 */

Aboki.prototype.convert = function(amount, from, to, output) {
  var _this = this
  var ojson

  if (!intersection([from, to], _this.currencies).length || !intersection(['ngn'], [from, to]).length) {
    log('Oops! You are trying to do something useful. from: ' + from + ', to: ' + to, 'warn')
    process.exit(1)
  }

  _this._getCurrentRate(function(err, rates) {
    from = lowercase(trim(from))
    to = lowercase(trim(to))
    ojson = { [from]: amount }

    if (from === 'ngn') {
      ojson[to] = _.round(_.divide(amount, rates[to]), 2)
      ojson['rate'] = rates[to]
    } else if (intersection([from], _this.currencies).length) {
      ojson['ngn'] = _.multiply(amount, rates[from])
      ojson['rate'] = rates[from]
    }

    log('Conversion Successful')
    log('SEE HOW MUCH YOU GET IF YOU SELL')
    switch (output) {
      case 'table':
        _.each(ojson, function(value, key) {
          _this.verticalTable.push({
            [key]: value
          })
        })
        log(_this.verticalTable.toString())
        break;
      case 'json':
        log(JSON.stringify(ojson, null, 2), 'log')
        break
      default:
        log(output + '(1) does not exist. try --help or run with --ouput json', 'warn')
        process.exit(1)
    }
  })
}


/**
 * [test]
 * Test to make sure everything's working.
 *
 *
 * @return {null}
 * @api public
 */

Aboki.prototype.test = function() {
  var _this = this

  _this._makeRequest(function(err, content) {
    if (err || _.isEmpty(content)) {
      log('Oops! Catastrophic Failure', 'error')
      log('If the problem persists, please email r@akinjide.me.', 'error')
      process.exit(1)
    } else {
      log('Yippe! you\'ve broken nothing!', 'log')
      process.exit(0)
    }
  })
}


/**
 * Handle programmer input, and do stuffs.
 */

var aboki = new Aboki('1.0.1')

program
  .version(aboki.version)
  .description('Black market currency rate instantly in your terminal! (Powered by AbokiFx: https://abokifx.com/).')
  .on('--help', aboki.help)

program
  .command('recent')
  .description('output recent exchange rates for USD, GBP or EUR')
  .action(aboki.recent.bind(aboki))

program
  .command('rates [type]')
  .description('specify rates type to show (cbn|movement|lagos_previous|moneygram|westernunion|otherparallel) [cbn]')
  .action(function(type) {
    if (!intersection([type], aboki.types).length) {
      log('Not sure which type?', 'warn')
      log('You can specify any of this: cbn, movement, lagos_previous, moneygram, westernunion or otherparallel\n[default: cbn]\n', 'warn')
      type = 'cbn'
    }

    aboki.rates(type)
  })

program
  .command('rate [currency]')
  .alias('r')
  .description('specify currency rate to show (usd|gbp|eur) [usd]')
  .option('-o, --output [type]', 'Specify output type (json|table) [table]', /^(json|table)$/i, 'table')
  .action(function(currency, opts) {
    currency = lowercase(currency)
    if (!intersection([currency], aboki.currencies).length) {
      log('Not sure?', 'warn')
      log('You can specify any of this: usd, gbp or eur\n[default: usd]\n', 'warn')
      currency = 'usd'
    }

    aboki.rate(currency,  opts.output)
  })

program
  .command('convert <amount> <from> <to>')
  .alias('c')
  .description('convert from a currency to another specified currency')
  .option('-o, --output [type]', 'Specify output type (json|table) [table]', /^(json|table)$/i, 'table')
  .action(function(amount, from, to, opts) {
    aboki.convert(_.toNumber(amount), from, to, opts.output)
  })

program
  .command('test')
  .alias('t')
  .description('check to make sure everything\'s working')
  .action(aboki.test.bind(aboki))

program.parse(process.argv)

var pkgs = program.args
if (!pkgs.length) program.help()
