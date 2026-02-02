document.getElementById("sidebar-container").innerHTML = `
<nav id="sidebar">
  <ul>
    <li>
      <span class="logo">site logo</span>
    </li>

    <li class="active">
      <a href="mainpage.html">Home</a>
    </li>

    <li>
      <a href="coming-soon.html">Coming Soon</a>
    </li>

    <li>
      <a href="comingsoon.html">Coming Soon</a>
    </li>

    <li>
      <button class="dropdown-btn">
        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000">
          <path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Z"/>
        </svg>
        <span>Home Page</span>
      </button>

      <ul class="sub-menu">
        <li><a href="#">Home</a></li>
        <li><a href="#">Coming Soon</a></li>
        <li><a href="#">Coming Soon</a></li>
      </ul>
    </li>
  </ul>
</nav>
`
