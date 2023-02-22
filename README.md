#MeidaStream
Streaming video through a MediaSource media object<br>

It is a library for streaming video and audio. <br>

To work, you need to convert video / audio from webm with a key frame rate of 1 second.<br>

An example of converting via ffmpeg:<br>
ffmpeg -i kyiv.mp4 -force_key_frames expr:gte(t,n_forced*1) -c:v libvpx -b:v 1M -c:a libvorbis kyiv.webm<br>

Next, you need to remux the WebM file to meet the WebM Byte Stream requirements using the /bin/remuxer utility.<br>
remuxer -cm=800 kyiv.webm kyiv.out.webm<br>

After you need to create a manifest of the received media file<br>
manifest kyiv.out.webm > kyiv.out.webm.json<br><br>

Library for working with webm:<br><br>
https://github.com/acolwell/mse-tools<br>

Examples of using:
index.php - playing video list<br>
video.php - play one video<br>
audio.php - audio<br>
preload.php - Load buffer in multiple videos with one request<br>


Initialization example:<br>
(new MediaStream(media, [<br>
     {<br>
         url: "media/kyiv.webm",<br>
         manifest: JSON.parse(atob("<?= base64_encode(json_encode($manifest)) ?>"))<br>
     }<br>
]));<br>

// To load the buffer of all videos. In the list of videos, one request for one second from each video. <br>
// This creates the effect of instant video playback even on long requests.<br>
MediaStrim.urlPreLoad = "preload.php";<br>
// Next, we call the load<br>
MediaStrim.preLoad();<br>


The MeidaStream lib is open-sourced software licensed under the MIT license.
