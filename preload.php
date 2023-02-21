<?php

//print_r($_POST);exit;

if (isset($_POST['items']) && is_array($_POST['items'])) {
    foreach ($_POST['items'] as $item) {
        $purl = parse_url($item['url']);
        
        if (isset($purl['path'])) {
            $pinf = pathinfo($purl['path']);
            
            $file = __dir__ . "/" . ltrim($purl['path'], '/');
            
            if (isset($pinf['basename'])) {
                if (file_exists($file)) {
                    $fp = fopen($file, "r");
                    
                    fseek($fp, $item['range'][0]);
                    
                    echo fread($fp, $item['range'][1] - $item['range'][0] + 1);
                    
                    fclose($fp);
                }
            }
        }
    }
}
