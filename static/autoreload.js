// Long polling client for live reload
// @author: ian

;function AutoReload(options) {
  if (typeof XMLHttpRequest === 'undefined') {
    throw new Error("Browser does not support AutoReload");
  }

  // https://gist.github.com/iwek/5599777
  function ajaxGet(settings) {
    var xhr = new XMLHttpRequest();

    xhr.ontimeout = function () {
      console.error("The request for " + url + " timed out.");
      settings.error({timeout: true});
    };

  	xhr.onreadystatechange = function() {
  		if (xhr.readyState !== 4 || xhr.responseText.length === 0) {
  			return;
  		}

  		if (xhr.status === 200) {
  			settings.success(JSON.parse(xhr.responseText));
  		}
      else {
        settings.error(JSON.parse(xhr.responseText));
      }
  	};

  	xhr.open('GET', settings.url, true);
  	xhr.send('');
    return xhr;
  }

  this.watch = function() {
    var _self = this;

    // Collect linked stylesheets from localhost.
    this._collectLinkedStylesheets();

    (function poll() {
      _self.xhr = ajaxGet({
        url: window.location.protocol + '//localhost:' + options.port + '/autoreload/listen',
        success: function(data) {
          _self.reload(data);
          _self.xhr = poll();
        },
        error: function(err) {
          console.error("Error connecting to the autoreload server");
          _self.xhr = null;
          if (err.timeout === true)
            _self.xhr = poll();
        },
        timeout: 1000*60*10,
        dataType: 'json'
      });
    })();
  };

  this.stop = function() {
    if (this.xhr) this.xhr.abort();
  }

  this.reload = function(changedFiles) {
    // If the changed file is a stylesheet, try and reload the stylesheet
    // without a full page reload.
    if (changedFiles.length === 0)
      return;

    // If only stylesheets have changed
    var onlyStylesheets = true;
    for (var i=0; i<changedFiles.length; i++) {
      if (!/\.css$/.test(changedFiles)) {
        onlyStylesheets = false;
        break;
      }
    }

    if (onlyStylesheets === true) {
      var atLeastOneStylesheetReattached = false;
      // Reload the stylesheet
      for (var i=0; i<changedFiles.length; i++) {
        var existingLink = this._linkedStylesheets[changedFiles[i]];
        if (existingLink) {
          atLeastOneStylesheetReattached = true;
          console.debug("reattaching stylesheet %s", existingLink.href);
          var newLink = this._reattachStylesheetLink(existingLink);
          this._linkedStylesheets[changedFiles[i]] = newLink;
        }
      }

      if (atLeastOneStylesheetReattached === true)
        return;
    }

    // Fallback is to just reload the whole window
    console.debug("auto-reloading window");
    window.location.reload();
  };

  this._collectLinkedStylesheets = function() {
    var tags = document.getElementsByTagName('link');
    var links = {};
    for (var i=0; i<tags.length; i++) {
      if (!tags[i].rel || tags[i].rel.toLowerCase() !== 'stylesheet' || !tags[i].href)
        continue;

      var hostname = 'localhost:' + options.port + '/';
      var hostnameIndex = tags[i].href.indexOf(hostname);
      if (hostnameIndex === -1)
        continue;

      // Chop off the host and just return the path to the stylesheet
      links[tags[i].href.slice(hostnameIndex + hostname.length)] = tags[i];
    }
    this._linkedStylesheets = links;
  };

  // Reattach a changed stylesheet link
  this._reattachStylesheetLink = function(link) {
    var clone = link.cloneNode(false);
    var parent = link.parentNode;

    if (parent.lastChild === link) {
      parent.appendChild(clone);
    } else {
      parent.insertBefore(clone, link.nextSibling);
    }

    var additionalWaitingTime;
    if (/AppleWebKit/.test(navigator.userAgent)) {
      additionalWaitingTime = 5;
    } else {
      additionalWaitingTime = 200;
    }

    setTimeout(function() {
      if (!link.parentNode) {
        return;
      }
      link.parentNode.removeChild(link);
      clone.onreadystatechange = null;
    }, additionalWaitingTime);

    return clone;
  };
}
