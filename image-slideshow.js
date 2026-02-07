const slides = document.querySelectorAll(".slide")
const dots = document.querySelectorAll(".dot")
let index = 0

setInterval(() => {
  slides[index].classList.remove("active")
  dots[index].classList.remove("active")

  index = (index + 1) % slides.length

  slides[index].classList.add("active")
  dots[index].classList.add("active")
}, 3000)
dots.forEach((dot, i) => {
  dot.addEventListener("click", () => {
    slides[index].classList.remove("active")
    dots[index].classList.remove("active")

    index = i

    slides[index].classList.add("active")
    dots[index].classList.add("active")
  })
})
