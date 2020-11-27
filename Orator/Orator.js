function customTag(tagName,fn){
    document.createElement(tagName);
    //alert("customtag");
    //find all the tags occurrences (instances) in the document
    var tagInstances = document.getElementsByTagName(tagName);
          //for each occurrence run the associated function
          for ( var i = 0; i < tagInstances.length; i++) {
            //alert("for loop");
              fn(tagInstances[i]);
          }
  }
   
  function content(element){
                var name = element.attributes.name.value;
                element.innerHTML = "<p > "+ name + " </p>";
  }   
            
  document.addEventListener("DOMContentLoaded", function(e) {
   
  customTag("content",content);    
    });