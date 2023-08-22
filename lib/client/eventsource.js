const XMLHttpRequest = require('./xmlhttprequest.js')

// Modified from https://github.com/remy/polyfills/blob/master/EventSource.js

const reTrim = /^(\s|\u00A0)+|(\s|\u00A0)+$/g

class EventSource {
  CONNECTING = 0
  OPEN = 1
  CLOSED = 2
  readyState = 0

  onerror = null
  onmessage = null
  onopen = null

  /**
   * @param {string} url
   */
  constructor (url) {
    if (!url || typeof url !== 'string') {
      throw new SyntaxError('Not enough arguments')
    }

    this.interval = 500 // polling interval
    this.lastEventId = null
    this.cache = ''

    this.URL = url
    this.url = url
    this.readyState = this.CONNECTING
    this._pollTimer = null
    this._xhr = null
    this._timeoutXhr = null

    this.poll() // init now
  }

  /**
   * @param {number} interval
   */
  pollAgain (interval) {
    this._pollTimer = setTimeout(() => {
      this.poll()
    }, interval)
  }

  poll () {
    const eventsource = this

    try { // force hiding of the error message... insane?
      if (eventsource.readyState === eventsource.CLOSED) return

      // NOTE: IE7 and upwards support
      const xhr = new XMLHttpRequest()
      xhr.open('GET', eventsource.URL, true)
      xhr.setRequestHeader('Accept', 'text/event-stream')
      xhr.setRequestHeader('Cache-Control', 'no-cache')
      // we must make use of this on the server side if we're working with Android - because they don't trigger
      // readychange until the server connection is closed
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')

      if (eventsource.lastEventId != null) xhr.setRequestHeader('Last-Event-ID', eventsource.lastEventId)
      eventsource.cache = ''

      xhr.timeout = 50000
      xhr.onreadystatechange = function () {
        if (this.readyState === 3 || (this.readyState === 4 && this.status === 200)) {
          // on success
          if (eventsource.readyState === eventsource.CONNECTING) {
            eventsource.readyState = eventsource.OPEN
            eventsource.dispatchEvent('open', { type: 'open' })
          }

          let responseText = ''
          try {
            responseText = this.responseText || ''
          } catch (e) { }

          // process this.responseText
          const parts = responseText.substring(eventsource.cache.length).split('\n')
          let eventType = 'message'
          let data = []
          let i = 0
          let line = ''

          eventsource.cache = responseText

          // TODO handle 'event' (for buffer name), retry
          for (; i < parts.length; i++) {
            line = parts[i].replace(reTrim, '')
            if (line.indexOf('event') === 0) {
              eventType = line.replace(/event:?\s*/, '')
            } else if (line.indexOf('retry') === 0) {
              const retry = parseInt(line.replace(/retry:?\s*/, ''))
              if (!isNaN(retry)) { eventsource.interval = retry }
            } else if (line.indexOf('data') === 0) {
              data.push(line.replace(/data:?\s*/, ''))
            } else if (line.indexOf('id:') === 0) {
              eventsource.lastEventId = line.replace(/id:?\s*/, '')
            } else if (line.indexOf('id') === 0) { // this resets the id
              eventsource.lastEventId = null
            } else if (line === '') {
              if (data.length) {
                const event = new MessageEvent(data.join('\n'), eventsource.url, eventsource.lastEventId)
                eventsource.dispatchEvent(eventType, event)
                data = []
                eventType = 'message'
              }
            }
          }

          if (this.readyState === 4) eventsource.pollAgain(eventsource.interval)
          // don't need to poll again, because we're long-loading
        } else if (eventsource.readyState !== eventsource.CLOSED) {
          if (this.readyState === 4) { // and some other status
            // dispatch error
            eventsource.readyState = eventsource.CONNECTING
            eventsource.dispatchEvent('error', { type: 'error' })
            eventsource.pollAgain(eventsource.interval)
          } else if (this.readyState === 0) { // likely aborted
            eventsource.pollAgain(eventsource.interval)
          }
        }
      }

      xhr.send()

      eventsource._timeoutXhr = setTimeout(function () {
        xhr.abort()
      }, xhr.timeout)

      eventsource._xhr = xhr
    } catch (e) { // in an attempt to silence the errors
      eventsource.dispatchEvent('error', { type: 'error', data: e.message }) // ???
    }
  };

  close () {
    // closes the connection - disabling the polling
    this.readyState = this.CLOSED
    clearTimeout(this._pollTimer)
    clearTimeout(this._timeoutXhr)
    this._xhr.abort()
  }

  /**
   * @param {string} type
   * @param {{type: string, data?: string}} event
   */
  dispatchEvent (type, event) {
    const handlers = this['_' + type + 'Handlers']
    if (handlers) {
      for (const handler of handlers) {
        handler.call(this, event)
      }
    }

    if (this['on' + type]) {
      this['on' + type](event)
    }
  }

  /**
   * @param {string} type
   * @param {any} handler
   */
  addEventListener (type, handler) {
    if (!this['_' + type + 'Handlers']) {
      this['_' + type + 'Handlers'] = []
    }

    this['_' + type + 'Handlers'].push(handler)
  }

  /**
   * @param {string} type
   * @param {any} handler
   */
  removeEventListener (type, handler) {
    const handlers = this['_' + type + 'Handlers']
    if (!handlers) {
      return
    }
    for (let i = handlers.length - 1; i >= 0; --i) {
      if (handlers[i] === handler) {
        handlers.splice(i, 1)
        break
      }
    }
  }
}

class MessageEvent {
  /**
   * @param {string} data
   * @param {string} origin
   * @param {string} lastEventId
   */
  constructor (data, origin, lastEventId) {
    this.data = data
    this.origin = origin
    this.lastEventId = lastEventId || ''

    this.type = 'message'
  }
}

module.exports = EventSource
