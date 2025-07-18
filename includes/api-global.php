<?php
add_action('rest_api_init', function(){
    register_rest_route('quiz-assist/v1','/global-chat',[
      'methods'             => 'POST',
      'callback'            => 'qa_global_chat',
      'permission_callback' => '__return_true',
    ]);
});

function qa_global_chat( WP_REST_Request $req ) {
    $msg = sanitize_text_field( $req->get_json_params()['message'] ?? '' );
    $key = qa_get_api_key();
    if(!$key) return new WP_Error('no_api_key','Missing key',['status'=>500]);

    $system = qa_get_prompt('qa_global_prompt');
    qa_log("G_SYS: {$system}");
    qa_log("G_USR: {$msg}");

    $resp = wp_remote_post('https://api.openai.com/v1/chat/completions',[
      'timeout'=>30,
      'headers'=>[
        'Authorization'=>"Bearer {$key}",
        'Content-Type'=>'application/json',
      ],
      'body'=>wp_json_encode([
        'model'=>'gpt-4',
        'messages'=>[
          ['role'=>'system','content'=>$system],
          ['role'=>'user','content'=>$msg],
        ],
        'temperature'=>0.7,
        'max_tokens'=>512,
      ]),
    ]);

    if(is_wp_error($resp)){
      return new WP_Error('openai_fail','OpenAI error',['status'=>500]);
    }

    $body = wp_remote_retrieve_body($resp);
    $j    = json_decode($body,true);
    return ['reply'=>$j['choices'][0]['message']['content'] ?? ''];
}
