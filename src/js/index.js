import Three from './experience'
import '../css/global.css'

import '../scss/global.scss'

document.addEventListener('DOMContentLoaded', () => {})

window.addEventListener('load', () => {
  const canvas = document.querySelector('#canvas')

  if (canvas) {
    window.threeExperience = new Three(canvas)
    window.threeApp = window.threeExperience
  }
})
