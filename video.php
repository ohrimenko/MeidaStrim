<?php

$video = "kyiv.webm";

$manifest = file_get_contents(__dir__ . "/manifest/" . $video . ".mnf");

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
    
    <script type="text/javascript" src="src/MediaData.js?time=<?= time() ?>"> </script>
  </head>
  <body>
    <div class="div-video">
      <video id="video" controls="" poster="media/<?= $video ?>.png"></video>
      <video onclick="clickVideoSt(this)" onplay="clickVideoSt(this)" controls="" poster="media/<?= $video ?>.png" data-src="media/<?= $video ?>?time=<?= time() ?>"></video>
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

var objMediaData = new MediaData(document.getElementById('video'), [
    {
        url: "media/<?= $video ?>?time=<?= time() ?>",
        manifest: JSON.parse(atob("<?= str_replace(["\n", '"'], ['\n', '\"'], $manifest) ?>"))
    }
]);

objMediaData.play();
//objMediaData.start(true); 

//objMediaData.preLoad(function () {});

setInterval(function () {
    return;
    
    objMediaData.reinit();
}, 3000);

setInterval(function () {
    return;
    
    objMediaData.play(60);
}, 10000);

setInterval(function () {
    return;
            
    if (objMediaData.sKey == objMediaData.sKeyInit) {
        if (objMediaData.sKey == 0) {
            objMediaData.sKey = 1;
        } else {
            objMediaData.sKey = 0;
        }
    }
}, 100);

setInterval(function () {
    return;
            
    //objMediaData.reinit();
    //objMediaData.play(60);
    if (objMediaData.isPlay) {
        objMediaData.stop(true);
    } else {
        objMediaData.play();
    }
}, 10000);
</script>