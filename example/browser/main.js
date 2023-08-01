const Client = require('@synonymdev/web-relay/lib/client/index.js')
const b4a = require('b4a')

// Most of the code below is just for the UI,
// the important parts are marked with ==== PUT ====, ==== GET === and ==== SUBSCRIBE ====

const address = 'http://localhost:3000'

const alice = new Client({
  relay: address
})

const bob = new Client({
  relay: address
})

const canvas = document.getElementById("price-canvas").getContext("2d");

// ==== SUBSCRIBE ====
const price = document.getElementById('price')
bob.subscribe("slash:8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo/price?relay=http://localhost:3000", (value) => {
  price.innerHTML = '$' + b4a.toString(value)
})

bob.subscribe("slash:8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo/history?relay=http://localhost:3000", (value) => {
  const history = JSON.parse(b4a.toString(value))
  drawGraph(history)
})
// ==================

{
  const form = document.getElementById('alice')

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
    await alice.put(key, Buffer.from(value))
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
  const form = document.getElementById('bob')

  const button = form.querySelector('#button')
  const keyInput = form.querySelector('#key')

  keyInput.addEventListener('input', checkDisabled)

  button.addEventListener('click', get)
  button.disabled = true

  async function get(event) {
    event.preventDefault()
    const key = keyInput.value
    const url = await alice.createURL(key)

    // ==== GET ==== 
    const value = await bob.get(url)
      .catch(error => {
        alert(error.message)
      })
    // ============= 

    alert(`Key:${key} value: ${b4a.toString(value)}`)
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

function drawGraph(data) {
  canvas.clearRect(0, 0, 400, 400);

  var xValues = [];
  var yValues = [];

  for (var i = 0; i < data.length; i++) {
    xValues.push(i);
    yValues.push(data[i] * 200 / 1000000);
  }

  canvas.beginPath();
  canvas.moveTo(0, 300);
  for (var i = 0; i < data.length; i++) {
    canvas.lineTo(i * 400 / 7, yValues[i]);
  }
  canvas.lineTo(400, 300);
  canvas.stroke();

  canvas.fillStyle = "green";
  canvas.fill();
}
