var sax = require("sax");
var strict = true;

/**
 * Really simple XML DOM implementation based on sax that works with Strings.
 *
 * If you have an XML string and want a DOM this utility is convenient.
 *
 * var domjs = new DomJS();
 * domjs.parse(xmlString, function(err, dom) {
 *
 * });
 *
 * If you want to compile C there are versions based on libxml2
 * and jsdom is full featured but complicated.
 *
 * This is "lightweight" meaning really simple and serves my purpose, it does not support namespaces or all
 * of the features of XML 1.0  it just takes a string and returns a JavaScript object graph.
 *
 * There are only three types of object supported Element, Text and Comment.
 *
 * e.g.
 *
 * take  <xml><elem att="val1"/><elem att="val1"/><elem att="val1"/></xml>
 *
 * return     { name : "xml",
 *               namespace: 'http://...',
 *               namespacePrefix: 'ns',
 *               namespaces: {},
 *               root: elem,
 *               document: root,
 *               attributes : {}
 *               children [
 *                 { name : "elem", attributes : {att:'val1'}, children [] },
 *                 { name : "elem", attributes : {att:'val1'}, children [] },
 *                 { name : "elem", attributes : {att:'val1'}, children [] }
 *               ]
 *             }
 *
 * The object returned can be serialized back out with obj.toXml();
 *
 *
 * @constructor DomJS
 */
DomJS = function() {
    this.root = null;
    this.stack = new Array();
    this.currElement = null;
    this.error = false;
};

DomJS.prototype.parseName = function(value, element) {
    var colon = value.indexOf(':');
    var prefix = colon > 0 ? value.substring(0, colon) : null;
    return {
        name: colon > 0 ? value.substring(colon + 1) : value,
        prefix: prefix,
        namespace: element ? (prefix == null ? element.targetNamespace : element.resolveNamespace(prefix)) : undefined
    }
};

DomJS.prototype.parse = function(string, cb) {
    if (typeof string != 'string') {
        cb(true, 'Data is not a string');
        return;
    }

    parser = sax.parser(strict);
    var self = this;

    parser.onerror = function (err) {
        this.error = true;
        cb(true, err);
    };
    parser.ontext = function (text) {
        if (self.currElement == null) {
            // console.log("Content in the prolog " + text);
            return;
        }
        textNode = new Text(text);
        self.currElement.children.push(textNode);
    };
    parser.onopentag = function (node) {

        var namespaces = {};
        for (var nsName in  node.attributes) {
            if (nsName.indexOf('xmlns:') == 0)
                namespaces[self.parseName(nsName).name] = node.attributes[nsName];
        }

        var xmlns = node.attributes['xmlns'];
        var targetNamespace = node.attributes['targetNamespace'];

        if (xmlns)
            namespaces['xmlns'] = xmlns;

        var elem = new Element(node.name, node.attributes);

        if (self.root == null) {
            self.root = elem;
        }

        var nameInfo = self.parseName(node.name);
        var nsPrefix = nameInfo.prefix;
        elem.namespaces = namespaces;
        elem.parent = self.currElement;
        elem.targetNamespace = targetNamespace || (elem.parent ? elem.parent.targetNamespace : undefined);
        elem.namespace = elem.resolveNamespace(nsPrefix);
        elem.localName = nameInfo.name;
        elem.root = self.root;

        if (self.currElement != null) {
            self.currElement.children.push(elem);
        }
        self.currElement = elem;
        self.stack.push(self.currElement);
    };
    parser.onclosetag = function (node) {
        self.stack.pop();
        self.currElement = self.stack[self.stack.length - 1 ];// self.stack.peek();
    };
    parser.oncomment = function (comment) {
        if (self.currElement == null) {
            console.log("Comments in the prolog discarded " + comment);
            return;
        }
        commentNode = new Comment(comment);
        self.currElement.children.push(commentNode);
    };

    parser.onend = function () {
        if (self.error == false) {
            cb(false, self.root);
        }
    };

    parser.write(string).close();
};

DomJS.prototype.reset = function() {
    this.root = null;
    this.stack = new Array();
    this.currElement = null;
    this.error = false;
};

escape = function(string) {
    return string.replace(/&/g, '&amp;')
            .replace(/>/g, '&gt;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
};


Element = function(name, attributes, children) {
    this.name = name;
    this.attributes = attributes || [];
    this.children = children || [];

    this.toXml = function(sb) {
        if (typeof sb == 'undefined') {
            sb = {buf:''}; // Strings are pass by value in JS it seems
        }
        sb.buf += '<' + this.name;
        for (att in this.attributes) {

            sb.buf += ' ' + att + '="' + escape(this.attributes[att]) + '"';
        }
        if (this.children.length != 0) {
            sb.buf += '>';
            for (var i = 0; i < this.children.length; i++) {
                this.children[i].toXml(sb);
            }
            sb.buf += '</' + this.name + '>';
        }
        else {
            sb.buf += '/>';
        }
        return sb.buf;
    };

    this.firstChild = function() {
        if (this.children.length > 0) {
            return this.children[0];
        }
        return null;
    };

    this.text = function() {
        if (this.children.length > 0) {
            if (typeof this.children[0].text == 'string') {
                return this.children[0].text;
            }
            ;
        }
        return null;
    };
};
Text = function(data) {
    this.text = data;

    this.toXml = function(sb) {
        sb.buf += escape(this.text);
    };
};
Comment = function(comment) {
    this.comment = comment;

    this.toXml = function(sb) {
        sb.buf += '<!--' + this.comment + '-->';
    };
};

Element.prototype.selectByName = function(name, ns) {
    var result = [];

    this.children.forEach(function(child) {
        if ((!ns && child.name == name) || (ns && ns == child.namespace && child.localName == name))
            result.push(child);
    });

    return result;
};

Element.prototype.resolveNamespace = function(prefix) {
    if (!prefix)
        prefix = 'xmlns';

    var currentEl = this;
    while (currentEl != null) {
        if (currentEl.namespaces[prefix]) {
            return currentEl.namespaces[prefix];
        }
        currentEl = currentEl.parent;
    }
    return null;
};

Element.prototype.selectSingleByName = function(name, ns) {
    var result = this.selectByName(name, ns);

    if (result.length != 1)
        throw 'Select "' + name + '" returned ' + result.length + ' elements, but only 1 expected';

    return result[0];
};


exports.Element = Element;
exports.Text = Text;
exports.Comment = Comment;
exports.DomJS = DomJS;
exports.escape = escape;
