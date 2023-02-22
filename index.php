<?php

$media = "kyiv.webm";

$manifest = json_decode(file_get_contents(__dir__ . "/manifest/" . $media . ".json"), true);

//echo "<pre>";print_r($mediainfo);exit;

?><!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>media</title>
    
    <style>
    body {
        background-color: #696969;
        padding: 22px 0px;
    }
    
    td .div-media:first-child {
        margin-top: 22px;
    }
    
    .div-media .media {
        border: 3px solid grey;
        background-color: #696969;
        width: 100%;
        max-width: 800px;
        height: auto;
        max-height: 600px;
        
        height: unset;
        aspect-ratio: 557 / 314;                
    }
    
    .div-media .media.active {
        border: 3px solid #A52A2A;
    }
    
    .display_none {
        display: none;
    }
    </style>
    
    <script type="text/javascript" src="src/MediaStrim.js?time=<?= time() ?>"> </script>
  </head>
  <body>
    <table id="listmedia" class="display_none" style="width: 100%;">
      <?php for ($i = 0; $i < 10; $i++) { ?>
      <tr>
        <td align="center" style="width: 100%;">
          <div class="div-media">
            <video class="media" controls="" poster="media/<?= $media ?>.png"></video>
          </div>
        </td>
      </tr>
      <?php } ?>
    </table>
    <table cellpadding="" cellspacing="" id="preload" style="width: 100%;height: 100%;position: fixed;top: -2px;right: -2px;bottom: 0px;left: 0px;">
      <tr>
        <td align="center" valign="middle" style="width: 100%;height: 100%;background-color: #696969;">
          <img style="width: 100%;max-width: 200px;" src="loading-gif.gif" />
        </td>
      </tr>
    </table>
  </body>
</html>
<script>

document.querySelectorAll(".div-media > .media").forEach((media) => {
    (new MediaStrim(media, [
        {
            url: "media/<?= $media ?>?time=<?= time() ?>&str=" + MediaStrim.randomString(5),
            manifest: JSON.parse(atob("<?= base64_encode(json_encode($manifest)) ?>"))
        }
    ]));
});

MediaStrim.urlPreLoad = "preload.php";

MediaStrim.preLoad(function(){
    document.addEventListener('scroll', windowScroll);
    document.querySelector('body').addEventListener('scroll', windowScroll);
    
    document.getElementById("listmedia").classList.remove('display_none');
    document.getElementById("preload").classList.add('display_none');
    
    playmedia();
});

function windowScroll(){     
    window.lastTimeScroll = Date.now();
    
    completeScroll(function () {
        playmedia();
    });
}

function completeScroll (cb, recurse) {
    if (window.startCompleteScroll && !recurse) {
        return;
    }
    
    window.startCompleteScroll = true;
    
    if (Date.now() - window.lastTimeScroll < 200) {
        setTimeout(function () {
           completeScroll(cb, true); 
        }, 20);
        
        return;
    }
    
    cb();
    
    window.startCompleteScroll = false;
};

function playmedia() {
    var isPlay = false;
    
    document.querySelectorAll(".div-media > .media").forEach((media) => {
        if (isVisible(media, true) && !isPlay) {
            if (media.paused) {
                media.play();
            }
            
            isPlay = true;
            
            media.classList.add('active');
        } else {
            media.classList.remove('active');
        }
    });
}

function isVisible(target, visibleTop) {
    var targetPosition = {
        top: window.pageYOffset + target.getBoundingClientRect().top,
        left: window.pageXOffset + target.getBoundingClientRect().left,
        right: window.pageXOffset + target.getBoundingClientRect().right,
        bottom: window.pageYOffset + target.getBoundingClientRect().bottom
    },
    windowPosition = {
        top: window.pageYOffset,
        left: window.pageXOffset,
        right: window.pageXOffset + document.documentElement.clientWidth,
        bottom: window.pageYOffset + document.documentElement.clientHeight
    };

    if (
        targetPosition.bottom > windowPosition.top && 
        (!visibleTop || targetPosition.top > windowPosition.top) && 
        targetPosition.top < windowPosition.bottom && 
        targetPosition.right > windowPosition.left && 
        targetPosition.left < windowPosition.right
    ) {
        return true;
    } else {
        return false;
    };
}

</script>