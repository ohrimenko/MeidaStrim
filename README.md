# MeidaStrim
Streaming video through a MediaSource media object

Это библиотека для потокового воспроизведения видео и аудио. 

Для работы нужно конвертировать видео/audio у webm с частотой ключевых кадров 1 секунда.

Пример конвертации через ffmpeg:
ffmpeg -i kyiv.mp4 -force_key_frames expr:gte(t,n_forced*1) -c:v libvpx -b:v 1M -c:a libvorbis kyiv.webm

Дальше нужно выполнить повторное мультиплексирование файла WebM, чтобы он соответствовал требованиям WebM Byte Stream при помощи утилиты /bin/remuxer
remuxer -cm=800 kyiv.webm kyiv.out.webm

После нужно создать манифест полученного медиа файла
manifest kyiv.out.webm > kyiv.out.webm.json

Бибилиотека для работы с webm:
https://github.com/acolwell/mse-tools

Примеры использования:
index.php - воспроизведения списка видео
video.php - воспроизведения одного видео
audio.php - аудио
preload.php - Подгрузка буфера в нескольких видео одним запросом


Пример инициализации:
(new MediaStrim(media, [
    {
        url: "media/kyiv.webm",
        manifest: JSON.parse(atob("<?= base64_encode(json_encode($manifest)) ?>"))
    }
]));

// Для подгрузки буфера всех видео. В списке видео одним запросов по одной секунде с каждого видео. 
// Это создает эффект мгновенного воспроизведения видео даже при длительных запросах.
MediaStrim.urlPreLoad = "preload.php";
// Дальше вызываем подгрузку
MediaStrim.preLoad();
