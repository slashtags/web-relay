const Client = require('@synonymdev/web-relay/client')
const b4a = require('b4a')

// Most of the code below is just for the UI,
// the important parts are marked with ==== PUT ====, ==== GET === and ==== SUBSCRIBE ====

const address = 'http://localhost:3000'

const client = new Client({
  relay: address
})

client.subscribe('/foo')

const price = document.getElementById('price')
client.subscribe("slash:8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo/price?relay=http://localhost:3000", (value) => {
  price.innerHTML = '$' + b4a.toString(value)
})

{
  const form = document.getElementById('put')

  const button = form.querySelector('#button')
  const keyInput = form.querySelector('#key')
  const valueInput = form.querySelector('#value')

  keyInput.addEventListener('input', checkDisabled)
  valueInput.addEventListener('input', checkDisabled)

  button.addEventListener('click', save)
  button.disabled = true

  async function save(event) {
    event.preventDefault()
    const key = keyInput.value
    const value = valueInput.value

    // ==== PUT ==== 
    await client.put(key, Buffer.from(value))
      .catch(error => {
        alert(error.message)
      })
    // ============= 

    keyInput.value = ''
    valueInput.value = ''
    button.disabled = true
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

  async function get(event) {
    event.preventDefault()
    const key = keyInput.value

    // ==== GET ==== 
    const value = await client.get(key)
      .catch(error => {
        alert(error.message)
      })
    // ============= 

    alert(`Got key:${key} value: ${value}`)
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
