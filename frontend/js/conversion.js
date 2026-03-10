let baseValue = 0
let currentTool = ""

function setUnits(tool){

  let dropdown = document.getElementById("unitSelect")

  dropdown.innerHTML = ""

  if(tool === "distance"){
    dropdown.innerHTML = `
      <option value="m">m</option>
      <option value="km">km</option>
      <option value="ft">ft</option>
    `
  }

  if(tool === "area"){
    dropdown.innerHTML = `
      <option value="sqm">m²</option>
      <option value="sqft">sqft</option>
      <option value="acre">acre</option>
    `
  }

  if(tool === "height"){
    dropdown.innerHTML = `
      <option value="m">m</option>
      <option value="ft">ft</option>
    `
  }

  dropdown.selectedIndex = 0
}

function convertValue(){

  let unit = document.getElementById("unitSelect").value
  let result = baseValue

  if(currentTool === "distance" || currentTool === "height"){

    if(unit === "m") result = baseValue
    if(unit === "km") result = baseValue / 1000
    if(unit === "ft") result = baseValue * 3.28084

  }

  if(currentTool === "area"){

    if(unit === "sqm") result = baseValue
    if(unit === "sqft") result = baseValue * 10.7639
    if(unit === "acre") result = baseValue * 0.000247105

  }

  document.getElementById("measureValue").innerText =
    result.toFixed(2) + " " + unit
}

document.getElementById("unitSelect")
    .addEventListener("change", convertValue)

function showDistance(distanceMeters){

  baseValue = distanceMeters
  currentTool = "distance"

  document.getElementById("measureType").innerText = "DISTANCE"

  setUnits("distance")

  convertValue()
}