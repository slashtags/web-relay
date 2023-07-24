const Client = require('@synonymdev/web-relay/lib/client.js')

const client = new Client()

const address = 'http://localhost:3000'

{
  const form = document.getElementById('put')

  const button = form.querySelector('#button')
  const keyInput = form.querySelector('#key')
  const valueInput = form.querySelector('#value')

  keyInput.addEventListener('input', checkDisabled)
  valueInput.addEventListener('input', checkDisabled)

  button.addEventListener('click', save)
  button.disabled = true

  function save(event) {
    event.preventDefault()
    const key = keyInput.value
    const value = valueInput.value

    client.put(address, key, Buffer.from(value), { metadata: { updatedAt: Date.now() } })
      .then(response => {
        if (response.ok) {
          console.log(response)
          alert(`${response.status} - ${response.statusText}`)
        }

        keyInput.value = ''
        valueInput.value = ''
        button.disabled = true
      })
      .catch(error => {
        alert(error.message)
      })
  }

  function checkDisabled() {
    const key = keyInput.value
    const value = valueInput.value

    if (key.length === 0 || value.length === 0) {
      button.disabled = true
    } else {
      button.disabled = false
    }
  }
}

{
  const form = document.getElementById('get')

  const button = form.querySelector('#button')
  const keyInput = form.querySelector('#key')

  keyInput.addEventListener('input', checkDisabled)

  button.addEventListener('click', get)
  button.disabled = true

  function get(event) {
    event.preventDefault()
    const key = keyInput.value

    client.get(address, client.id, key)
      .then(async response => {
        const data = []

        for await (let chunk of response) {
          for (let i = 0; i < chunk.length; i++) {
            data.push(chunk[i])
          }
        }
        const str = Buffer.from(data)
        alert(`Got key:${key} value: ${str} metadata: ${JSON.stringify(response.metadata)}`)
      })
      .catch(error => {
        alert(error.message)
      })
  }

  function checkDisabled() {
    const key = keyInput.value

    if (key.length === 0) {
      button.disabled = true
    } else {
      button.disabled = false
    }
  }
}
