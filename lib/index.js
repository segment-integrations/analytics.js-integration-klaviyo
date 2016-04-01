
/**
 * Module dependencies.
 */

var integration = require('analytics.js-integration');
var push = require('global-queue')('_learnq');
var tick = require('next-tick');
var Track = require('segmentio-facade').Track;
var foldl = require('foldl');

/**
 * Trait aliases.
 */

var traitAliases = {
  id: '$id',
  email: '$email',
  firstName: '$first_name',
  lastName: '$last_name',
  phone: '$phone_number',
  title: '$title'
};

/**
 * Expose `Klaviyo` integration.
 */

var Klaviyo = module.exports = integration('Klaviyo')
  .assumesPageview()
  .global('_learnq')
  .option('apiKey', '')
  .tag('<script src="//a.klaviyo.com/media/js/learnmarklet.js">');

/**
 * Initialize.
 *
 * https://www.klaviyo.com/docs/getting-started
 *
 * @api public
 */

Klaviyo.prototype.initialize = function() {
  var self = this;
  push('account', this.options.apiKey);
  this.load(function() {
    tick(self.ready);
  });
};

/**
 * Loaded?
 *
 * @api public
 * @return {Boolean}
 */

Klaviyo.prototype.loaded = function() {
  return !!(window._learnq && window._learnq.push !== Array.prototype.push);
};

/**
 * Identify.
 *
 * @api public
 * @param {Identify} identify
 */

Klaviyo.prototype.identify = function(identify) {
  // TODO: should map/alias the rest of the reserved props
  var traits = identify.traits(traitAliases);
  if (!traits.$id && !traits.$email) return;
  push('identify', traits);
};

/**
 * Group.
 *
 * @param {Group} group
 */

Klaviyo.prototype.group = function(group) {
  var props = group.properties();
  if (!props.name) return;
  push('identify', { $organization: props.name });
};

/**
 * Track.
 *
 * @param {Track} track
 */

Klaviyo.prototype.track = function(track) {
  push('track', track.event(), track.properties({
    revenue: '$value'
  }));
};

/**
 * Completed Order
 *
 * @param {Track} track
 */

Klaviyo.prototype.completedOrder = function(track) {
  var products = formatProducts(track.products());
  var payload = {
    $event_id: track.orderId(),
    $value: track.revenue(),
    Categories: products.categories,
    ItemNames: products.names,
    Items: products.items
  };

  push('track', track.event(), payload);
};

/**
 * Format products array.
 *
 * @param {Array} track
 * @return {Array}
 * @api private
 */

function formatProducts(products){
  return foldl(function(payloads, props){
    var product = new Track({ properties: props });
    payloads.categories.push(product.category());
    payloads.names.push(product.name());
    payloads.items.push(reject({
      SKU: product.sku(),
      Name: product.name(),
      Quantity: product.quantity(),
      ItemPrice: product.price(),
      RowTotal: product.price(),
      Categories: [product.category()],
      ProductURL: product.proxy('properties.productUrl'),
      ImageURL: product.proxy('properties.imageUrl')
    }));

    return payloads;
  }, { categories: [], names: [], items: [] }, products);
}

/**
 * Return a copy of an object, less an  `undefined` values.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function reject(obj) {
  return foldl(function(result, val, key) {
    if (val !== undefined) {
      result[key] = val;
    }
    return result;
  }, {}, obj);
}
