
    $(document).ready(function () { 
//code to add underline to current item
        var url = window.location.href;
        let me = $('ul li a');
        
        //using jquery map
        $(me).map(function(idx, elem) {
                console.log($(elem).attr("href"));
                  if(url.includes($(elem).attr("href"))){
                        console.log("active");
                        $(elem).addClass("active");
                }else{
                console.log("No");
                }
        });
      });

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