# MeidaStrim
Streaming video through a MediaSource media object<br>

Это библиотека для потокового воспроизведения видео и аудио. <br>

Для работы нужно конвертировать видео/audio у webm с частотой ключевых кадров 1 секунда.<br>

Пример конвертации через ffmpeg:<br>
ffmpeg -i kyiv.mp4 -force_key_frames expr:gte(t,n_forced*1) -c:v libvpx -b:v 1M -c:a libvorbis kyiv.webm<br>

Дальше нужно выполнить повторное мультиплексирование файла WebM, чтобы он соответствовал требованиям WebM Byte Stream при помощи утилиты /bin/remuxer<br>
remuxer -cm=800 kyiv.webm kyiv.out.webm<br>

После нужно создать манифест полученного медиа файла<br>
manifest kyiv.out.webm > kyiv.out.webm.json<br><br>

Бибилиотека для работы с webm:<br><br>
https://github.com/acolwell/mse-tools<br>

Примеры использования:
index.php - воспроизведения списка видео<br>
video.php - воспроизведения одного видео<br>
audio.php - аудио<br>
preload.php - Подгрузка буфера в нескольких видео одним запросом<br>


Пример инициализации:<br>
(new MediaStrim(media, [<br>
    {<br>
        url: "media/kyiv.webm",<br>
        manifest: JSON.parse(atob("<?= base64_encode(json_encode($manifest)) ?>"))<br>
    }<br>
]));<br>

// Для подгрузки буфера всех видео. В списке видео одним запросов по одной секунде с каждого видео. <br>
// Это создает эффект мгновенного воспроизведения видео даже при длительных запросах.<br>
MediaStrim.urlPreLoad = "preload.php";<br>
// Дальше вызываем подгрузку<br>
MediaStrim.preLoad();<br>
