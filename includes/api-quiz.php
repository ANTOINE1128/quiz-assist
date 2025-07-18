<?php
add_action('rest_api_init', function(){
    register_rest_route('quiz-assist/v1','/question/(?P<id>\d+)',[
      'methods'             => 'GET',
      'callback'            => 'qa_get_question',
      'permission_callback' => '__return_true',
    ]);
    register_rest_route('quiz-assist/v1','/ask-bot',[
      'methods'             => 'POST',
      'callback'            => 'qa_ask_bot',
      'permission_callback' => '__return_true',
    ]);
});

function qa_get_question( WP_REST_Request $req ) {
    global $wpdb;
    $id  = intval($req['id']);
    $tbl = $wpdb->prefix . 'learndash_pro_quiz_question';
    $row = $wpdb->get_row($wpdb->prepare(
      "SELECT question, answer_data FROM {$tbl} WHERE id=%d",
      $id
    ));
    if (! $row) {
      return new WP_Error('no_question','Not found',['status'=>404]);
    }
    $raw = maybe_unserialize($row->answer_data);
    if (! is_array($raw)) {
      return new WP_Error('invalid_data','Bad data',['status'=>500]);
    }
    $out = [];
    foreach($raw as $item){
      $vars = (array)$item;
      $txt  = '';
      $crt  = false;
      foreach($vars as $k=>$v){
        if(stripos($k,'answer')!==false) $txt = $v;
        if(stripos($k,'correct')!==false && $v) $crt = true;
      }
      $out[] = ['text'=>$txt,'correct'=>$crt];
    }
    return ['question'=>$row->question,'answers'=>$out];
}

function qa_ask_bot( WP_REST_Request $req ) {
    $p       = $req->get_json_params();
    $q       = sanitize_text_field($p['questionText'] ?? '');
    $answers = is_array($p['answers']??[]) ? $p['answers']: [];
    $type    = sanitize_text_field($p['promptType']??'');
    $key     = qa_get_api_key();

    if(!$key) return new WP_Error('no_api_key','Missing key',['status'=>500]);

    // build lists
    $all = $crt = $inc = '';
    foreach($answers as $i=>$a){
      $n = $i+1; $t = sanitize_text_field($a['text']??'');
      $all .= "{$n}. {$t}\n";
      if(!empty($a['correct'])) $crt .= "{$n}. {$t}\n";
      else                    $inc .= "{$n}. {$t}\n";
    }

    // templates
    $opts    = get_option('quiz_assist_options',[]);
    $sys_tpl = trim($opts["qa_{$type}_sys"]    ?? '');
    $usr_tpl = trim($opts["qa_{$type}_user"]   ?? '');
    if(!$sys_tpl||!$usr_tpl){
      return new WP_Error('bad_tpl','Missing template',['status'=>400]);
    }

    // interpolate user
    $user_msg = strtr($usr_tpl,[
      '{question}'  =>$q,
      '{list}'      =>$all,
      '{correct}'   =>$crt,
      '{incorrect}'=>$inc,
    ]);

    qa_log("SYS: {$sys_tpl}");
    qa_log("USR: {$user_msg}");

    $resp = wp_remote_post('https://api.openai.com/v1/chat/completions',[
      'timeout'=>30,
      'headers'=>[
        'Authorization'=>"Bearer {$key}",
        'Content-Type'=>'application/json',
      ],
      'body'=>wp_json_encode([
        'model'=>'gpt-4',
        'messages'=>[
          ['role'=>'system','content'=>$sys_tpl],
          ['role'=>'user','content'=>$user_msg],
        ],
        'temperature'=>0.7,
        'max_tokens'=>512,
      ]),
    ]);

    if(is_wp_error($resp)){
      qa_log($resp->get_error_message());
      return new WP_Error('openai_fail','OpenAI error',['status'=>500]);
    }

    $body = wp_remote_retrieve_body($resp);
    $j    = json_decode($body,true);
    return ['reply'=>$j['choices'][0]['message']['content'] ?? ''];
}
