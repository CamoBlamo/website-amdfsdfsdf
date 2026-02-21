const openButton = document.getElementById('open-sidebar-button')
const navbar = document.getElementById('navbar')
const settingsLink = document.getElementById('settings-link')

const media = window.matchMedia("(width < 700px)")

media.addEventListener('change', (e) => updateNavbar(e))

function updateNavbar(e){
  const isMobile = e.matches
  console.log(isMobile)
  if(isMobile){
    navbar.setAttribute('inert', '')
  }
  else{
    // desktop device
    navbar.removeAttribute('inert')
  }
}

function openSidebar(){
  navbar.classList.add('show')
  openButton.setAttribute('aria-expanded', 'true')
  navbar.removeAttribute('inert')
}

function closeSidebar(){
  navbar.classList.remove('show')
  openButton.setAttribute('aria-expanded', 'false')
  navbar.setAttribute('inert', '')
}

// Ensure settings link behavior (for progressive enhancement)
if (settingsLink) {
  settingsLink.addEventListener('click', (e) => {
    // default anchor behavior is sufficient; keep for future enhancements
  })
}

// For Bookmark Links
 const navLinks = document.querySelectorAll('nav a')
 navLinks.forEach(link => {
  link.addEventListener('click', () => {
    closeSidebar()
   })
 })

updateNavbar(media)