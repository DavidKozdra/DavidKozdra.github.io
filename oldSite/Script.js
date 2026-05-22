
    document.addEventListener("DOMContentLoaded", function () {
      // Add underline to current nav item.
      var url = window.location.href;
      var links = document.querySelectorAll("ul li a");

      links.forEach(function (elem) {
        var href = elem.getAttribute("href") || "";
        if (url.includes(href) || (href.includes("index") && /\/oldSite\/?($|#|\?)/.test(url))) {
          elem.classList.add("active");
        }
      });

      addBanner();
    });


function addBanner() {
  if (document.getElementById("banner")) return;
  if (!document.body) return;
  const banner = document.createElement("div");
  banner.id = "banner";
  banner.innerHTML =
    '<div class="container">' +
    '<h1 class="font-weight-bold text-uppercase mt-0 mb-0">Deprecated</h1>' +
    '<p>This site is no longer being updated. Visit <a style="color:white;text-decoration:underline;" href="https://davidkozdra.com/" target="_blank" rel="noopener noreferrer">davidkozdra.com</a>.</p>' +
    '</div>';
  document.body.prepend(banner);
}


/*

f

      $(function () {
          $("#myVideo").animate({ 
          opacity:1});
        $("div").animate({right: '20px'}, { duration: 300 });
        $("div ").animate({left: '20px'}, { duration: 300 });
        $("#face").animate({
            opacity: 1
         }, { duration: 300, queue: false });
        $(".container").animate({
            opacity: 1
         }, { duration: 300, queue: false });
    });

    */