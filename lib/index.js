
/**
 * Module dependencies.
 */

var integration = require('analytics.js-integration');
var push = require('global-queue')('_learnq');
var tick = require('next-tick');
var Track = require('segmentio-facade').Track;
var foldl = require('foldl');
var remove = require('obj-case').del;
var extend = require('extend');

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
 * http://learn.klaviyo.com/12887-Ecommerce:-Other-Integrations/product-activity-integrating-a-custom-ecommerce-cart-or-platform
 * @param {Track} track
 */

Klaviyo.prototype.completedOrder = function(track) {
  var products = formatProducts(track.products());
  // Their docs for client side tells users to send these properties slightly
  // different than server side, although they don't have to be.
  var payload = {
    $event_id: track.orderId(),
    $value: track.revenue(),
    Categories: products.categories,
    ItemNames: products.names,
    Items: products.items
  };

  var whitelist = [
    '$event_id',
    '$value',
    'orderId',
    'categories',
    'itemNames',
    'items',
    'revenue',
    'total',
    'products'
  ];
  // strip standard props and leave custom props only
  var topLevelCustomProps = filter(track, whitelist);

  payload = extend(payload, topLevelCustomProps);

  push('track', track.event(), payload);

  // Formulate payload per product to send
  var productProperties = formatItems(track);

  // Send a separate event for each product
  for (var x = 0; x < productProperties.length; x++) {
    push('track', 'Ordered Product', productProperties[x]);
  }
};


/**
 * Return only custom properties
 *
 * @param {Object, Array} facade, list
 * @return {Object}
 * @api private
 */

function filter(facade, list){
  var ret = facade.properties();
  for (var x = 0; x < list.length; x++){
    remove(ret, list[x]);
  }
  return ret;
}

/**
 * Format payload for each product.
 *
 * @param {Track} track
 * @return {Array}
 * @api private
 */

function formatItems(track){
  return foldl(function(payloads, props){
    var product = new Track({ properties: props });
    var itemWhitelist = [
      '$event_id',
      '$value',
      'name',
      'product categories',
      'category',
      'id',
      'sku',
      'quantity',
      'price',
      'productUrl',
      'imageUrl'
    ];

    // filter standard item props so we can merge custom props later
    var itemCustomProps = filter(product, itemWhitelist);

    var item = reject({
      $event_id: product.id() || track.orderId() + '_' + product.sku(),
      $value: product.price(),
      Name: product.name(),
      Quantity: product.quantity(),
      ProductCategories: [product.category()],
      ProductURL: product.proxy('properties.productUrl'),
      ImageURL: product.proxy('properties.imageUrl')
    });

    item = extend(item, itemCustomProps);
    payloads.push(item);

    return payloads;
  }, [], track.products());
}

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
    var whitelist = [
      'sku',
      'name',
      'quantity',
      'itemPrice',
      'price',
      'rowTotal',
      'categories',
      'category',
      'productUrl',
      'imageUrl'
    ];
    // filter standard traits to merge custom props later
    var customProps = filter(product, whitelist);

    var item = reject({
      SKU: product.sku(),
      Name: product.name(),
      Quantity: product.quantity(),
      ItemPrice: product.price(),
      RowTotal: product.price(),
      Categories: [product.category()],
      ProductURL: product.proxy('properties.productUrl'),
      ImageURL: product.proxy('properties.imageUrl')
    });
    item = extend(item, customProps);
    payloads.items.push(item);
    payloads.categories.push(product.category());
    payloads.names.push(product.name());

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
