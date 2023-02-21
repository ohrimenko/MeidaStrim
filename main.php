<?php

$video = "kyiv.webm";

$manifest = json_decode(file_get_contents(__dir__ . "/manifest/" . $video . ".json"), true);

//echo "<pre>";print_r($videoinfo);exit;

?><!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>video</title>
    
    <style>
    body {
        background-color: whitesmoke;
        padding: 22px 0px;
    }
    
    td .div-video:first-child {
        margin-top: 22px;
    }
    
    .div-video video {
        border: 1px solid grey;
        background-color: black;
        width: 100%;
        max-width: 800px;
        height: auto;
        max-height: 600px;
    }
    
    .div-video.active video {
        border: 1px solid red;
        border-radius: 3px;
    }
    </style>
    
    <script type="text/javascript" src="src/MediaStrim.js?time=<?= time() ?>"> </script>
  </head>
  <body>
    <div class="div-video">
      <video id="video" controls="" poster="<?= $video ?>.png"></video>
      <video onclick="clickVideoSt(this)" onplay="clickVideoSt(this)" controls="" poster="<?= $video ?>.png" data-src="./<?= $video ?>?time=<?= time() ?>"></video>
    </div>
  </body>
</html>
<script>

function clickVideoSt(obj) {
    if (!obj.getAttribute("src") && obj.getAttribute("data-src")) {
        obj.setAttribute("autoplay", "autoplay");
        obj.setAttribute("src", obj.getAttribute("data-src"));
    }
}

var objMediaStrim = new MediaStrim(document.getElementById('video'), [
    {
        url: "media/<?= $video ?>?time=<?= time() ?>",
        manifest: JSON.parse(atob("<?= base64_encode(json_encode($manifest)) ?>"))
    }
]);

objMediaStrim.play();
//objMediaStrim.start(true); 

//objMediaStrim.preLoad(function () {});

setInterval(function () {
    return;
    
    objMediaStrim.reinit();
}, 3000);

setInterval(function () {
    return;
    
    objMediaStrim.play(60);
}, 10000);

setInterval(function () {
    return;
            
    if (objMediaStrim.sKey == objMediaStrim.sKeyInit) {
        if (objMediaStrim.sKey == 0) {
            objMediaStrim.sKey = 1;
        } else {
            objMediaStrim.sKey = 0;
        }
    }
}, 100);

setInterval(function () {
    return;
            
    //objMediaStrim.reinit();
    //objMediaStrim.play(60);
    if (objMediaStrim.isPlay) {
        objMediaStrim.stop(true);
    } else {
        objMediaStrim.play();
    }
}, 10000);
</script>