<?php
if ( ! defined( 'ABSPATH' ) ) exit;

add_action('rest_api_init', function(){
    // Public GET; returns quiz stem + answers
    register_rest_route('quiz-assist/v1','/question/(?P<id>\d+)',[
      'methods'             => 'GET',
      'callback'            => 'qa_get_question',
      'permission_callback' => '__return_true',
    ]);

    // Public POST; guests allowed
    register_rest_route('quiz-assist/v1','/ask-bot',[
      'methods'             => 'POST',
      'callback'            => 'qa_ask_bot',
      'permission_callback' => '__return_true',
      'args'                => [
        'questionText' => [ 'required' => false ],
        'answers'      => [ 'required' => false ],
        'promptType'   => [ 'required' => true ],
      ],
    ]);
});

/**
 * Fetch a LearnDash question and extract answers.
 */
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
        $out[] = ['text'=>sanitize_text_field($txt),'correct'=> (bool) $crt];
    }
    return ['question'=>$row->question,'answers'=>$out];
}

/**
 * Call OpenAI using the best API for the selected model.
 * - gpt-5 / chatgpt-5 / o3 / o4 → Responses API
 * - everything else → Chat Completions
 */
function qa_ask_bot( WP_REST_Request $req ) {
    try {
        $p       = (array) $req->get_json_params();
        $q       = sanitize_text_field( $p['questionText'] ?? '' );
        $answers = is_array( $p['answers'] ?? [] ) ? $p['answers'] : [];
        $idx     = intval( $p['promptType'] ?? -1 );

        $opts    = get_option( 'quiz_assist_options', [] );
        $actions = $opts['qa_quiz_actions'] ?? [];

        if ( ! isset( $actions[ $idx ] ) ) {
            return new WP_Error( 'bad_type', 'Invalid action/button index', [ 'status' => 400 ] );
        }

        $label   = $actions[$idx]['label'] ?? ('Action #'.$idx);
        $sys_tpl = trim( (string) ( $actions[$idx]['sys']  ?? '' ) );
        $usr_tpl = trim( (string) ( $actions[$idx]['user'] ?? '' ) );

        if ( $sys_tpl === '' || $usr_tpl === '' ) {
            qa_log( "ERROR ► Missing sys/user template for action #{$idx}" );
            return new WP_Error(
                'missing_template',
                'One of your System or User prompts is empty. Please fill it in the dashboard.',
                [ 'status' => 400 ]
            );
        }

        $key = qa_get_api_key();
        if ( ! $key ) {
            qa_log( 'ERROR ► Missing OpenAI API key' );
            return new WP_Error( 'no_api_key', 'OpenAI API key not set', [ 'status' => 500 ] );
        }

        // Build formatted answer lists
        $all = $crt = $inc = '';
        foreach ( $answers as $i => $a ) {
            $n = $i + 1;
            $t = sanitize_text_field( $a['text'] ?? '' );
            $all .= "{$n}. {$t}\n";
            if ( ! empty( $a['correct'] ) ) $crt .= "{$n}. {$t}\n";
            else                            $inc .= "{$n}. {$t}\n";
        }

        $user_msg = strtr( $usr_tpl, [
            '{question}'  => $q,
            '{list}'      => $all,
            '{correct}'   => $crt,
            '{incorrect}' => $inc,
        ] );

        qa_log( "BTN[{$label}] SYS ► {$sys_tpl}" );
        qa_log( "BTN[{$label}] USR ► {$user_msg}" );

        $model = trim( $opts['qa_model'] ?? 'gpt-4o-mini' );
        $use_responses = (bool) preg_match( '/\b(gpt[-_]?5|chatgpt[-_]?5|o3|o4)\b/i', $model );
        $limit = 512;

        // Helper: robustly extract text from many response shapes
        $extract_text = static function( $j ) {
            // 1) Convenience field
            if ( isset( $j['output_text'] ) && is_string( $j['output_text'] ) && trim( $j['output_text'] ) !== '' ) {
                return trim( (string) $j['output_text'] );
            }

            $buf = '';

            // 2) output[] -> content[] -> text
            if ( ! empty( $j['output'] ) && is_array( $j['output'] ) ) {
                foreach ( $j['output'] as $node ) {
                    if ( isset( $node['content'] ) && is_array( $node['content'] ) ) {
                        foreach ( $node['content'] as $part ) {
                            if ( isset( $part['text'] ) ) {
                                $txt = $part['text'];
                                if ( is_array( $txt ) && isset( $txt['value'] ) ) $txt = $txt['value'];
                                if ( is_string( $txt ) ) $buf .= $txt;
                            }
                        }
                    }
                }
                $buf = trim( $buf );
                if ( $buf !== '' ) return $buf;
            }

            // 3) message->content[]->text (some Responses variants)
            if ( ! empty( $j['message']['content'] ) && is_array( $j['message']['content'] ) ) {
                foreach ( $j['message']['content'] as $part ) {
                    if ( isset( $part['text'] ) && is_string( $part['text'] ) ) {
                        $buf .= $part['text'];
                    } elseif ( isset( $part['text']['value'] ) && is_string( $part['text']['value'] ) ) {
                        $buf .= $part['text']['value'];
                    }
                }
                $buf = trim( $buf );
                if ( $buf !== '' ) return $buf;
            }

            // 4) Classic chat fallback (if server ever routed it)
            if ( isset( $j['choices'][0]['message']['content'] ) && is_string( $j['choices'][0]['message']['content'] ) ) {
                $buf = trim( (string) $j['choices'][0]['message']['content'] );
                if ( $buf !== '' ) return $buf;
            }

            return '';
        };

        if ( $use_responses ) {
            // === Responses API ===
            $payload = [
                'model'             => $model,
                'instructions'      => $sys_tpl,
                // Simple string input is the most compatible form
                'input'             => $user_msg,
                'max_output_tokens' => $limit,
            ];

            $resp = wp_remote_post(
                'https://api.openai.com/v1/responses',
                [
                    'timeout' => 30,
                    'headers' => [
                        'Authorization' => "Bearer {$key}",
                        'Content-Type'  => 'application/json',
                    ],
                    'body'    => wp_json_encode( $payload ),
                ]
            );

            if ( is_wp_error( $resp ) ) {
                qa_log( 'WP_ERROR ► ' . $resp->get_error_message() );
                return new WP_Error( 'openai_fail', 'OpenAI error', [ 'status' => 502 ] );
            }

            $body = wp_remote_retrieve_body( $resp );
            qa_log( 'RAW OPENAI (Responses) ► ' . $body );

            $j = json_decode( $body, true );
            if ( isset( $j['error']['message'] ) ) {
                return new WP_Error( 'openai_api', $j['error']['message'], [ 'status' => 502 ] );
            }

            $reply = $extract_text( $j );

            if ( $reply === '' ) {
                qa_log( 'EMPTY_TEXT_AFTER_PARSE ► model=' . $model );
                return new WP_Error( 'empty_reply', 'The model returned an empty response. Please try again.', [ 'status' => 502 ] );
            }

            if ( strlen( $reply ) > 20000 ) {
                $reply = substr( $reply, 0, 20000 ) . "\n\n…(truncated)…";
            }
            return [ 'reply' => $reply ];
        } else {
            // === Chat Completions API (GPT-4 family etc.) ===
            $payload = [
                'model'    => $model,
                'messages' => [
                    [ 'role' => 'system', 'content' => $sys_tpl ],
                    [ 'role' => 'user',   'content' => $user_msg ],
                ],
                'temperature' => 0.7,
                'max_tokens'  => $limit,
            ];

            $resp = wp_remote_post(
                'https://api.openai.com/v1/chat/completions',
                [
                    'timeout' => 30,
                    'headers' => [
                        'Authorization' => "Bearer {$key}",
                        'Content-Type'  => 'application/json',
                    ],
                    'body'    => wp_json_encode( $payload ),
                ]
            );

            if ( is_wp_error( $resp ) ) {
                qa_log( 'WP_ERROR ► ' . $resp->get_error_message() );
                return new WP_Error( 'openai_fail', 'OpenAI error', [ 'status' => 502 ] );
            }

            $body  = wp_remote_retrieve_body( $resp );
            qa_log( 'RAW OPENAI (Chat) ► ' . $body );

            $j     = json_decode( $body, true );
            if ( isset( $j['error']['message'] ) ) {
                return new WP_Error( 'openai_api', $j['error']['message'], [ 'status' => 502 ] );
            }

            $reply = trim( (string) ( $j['choices'][0]['message']['content'] ?? '' ) );
            if ( $reply === '' ) {
                return new WP_Error( 'empty_reply', 'The model returned an empty response. Please try again.', [ 'status' => 502 ] );
            }

            if ( strlen( $reply ) > 20000 ) {
                $reply = substr( $reply, 0, 20000 ) . "\n\n…(truncated)…";
            }
            return [ 'reply' => $reply ];
        }

    } catch ( \Throwable $e ) {
        qa_log( 'EXCEPTION ► ' . $e->getMessage() );
        return new WP_Error( 'server_error', 'Unexpected server error. Please try again.', [ 'status' => 500 ] );
    }
}


/** ------------ Helpers: try token keys & temperature fallbacks ------------ */

function qa_openai_try_chat_with_token_keys(array $base_payload, array $keys_order, int $limit, string $api_key) {
    foreach ($keys_order as $tk) {
        $payload = $base_payload;
        $payload[$tk] = $limit;

        $result = qa_openai_post_chat($payload, $api_key);
        if (is_array($result) && !empty($result['ok'])) {
            return $result['reply'];
        }

        if (is_array($result) && isset($result['error'])) {
            $msg  = (string) $result['error'];
            $code = (int) ($result['code'] ?? 0);

            // Unsupported token key? try next
            if (stripos($msg, 'Unsupported parameter') !== false && stripos($msg, $tk) !== false) {
                continue;
            }
            // Unsupported temperature? drop it and retry once
            if (stripos($msg, 'temperature') !== false &&
                (stripos($msg, 'Unsupported value') !== false || stripos($msg, 'does not support') !== false)) {
                $payload2 = $payload; unset($payload2['temperature']);
                $result2 = qa_openai_post_chat($payload2, $api_key);
                if (is_array($result2) && !empty($result2['ok'])) return $result2['reply'];
            }

            return new WP_Error('openai_api_error', $msg, ['status' => max(400, $code ?: 500)]);
        }
    }
    return new WP_Error('openai_fail','Could not reach the AI service or the response was invalid.', ['status'=>502]);
}

function qa_openai_try_responses_with_token_keys(array $base_payload, array $keys_order, int $limit, string $api_key) {
    foreach ($keys_order as $tk) {
        $payload = $base_payload;
        $payload[$tk] = $limit;

        $result = qa_openai_post_responses($payload, $api_key);
        if (is_array($result) && !empty($result['ok'])) {
            return $result['reply'];
        }

        if (is_array($result) && isset($result['error'])) {
            $msg  = (string) $result['error'];
            $code = (int) ($result['code'] ?? 0);

            // Unsupported token key? try next
            if (stripos($msg, 'Unsupported parameter') !== false && stripos($msg, $tk) !== false) {
                continue;
            }
            // Unsupported temperature? drop it and retry once
            if (stripos($msg, 'temperature') !== false &&
                (stripos($msg, 'Unsupported value') !== false || stripos($msg, 'does not support') !== false)) {
                $payload2 = $payload; unset($payload2['temperature']);
                $result2 = qa_openai_post_responses($payload2, $api_key);
                if (is_array($result2) && !empty($result2['ok'])) return $result2['reply'];
            }

            return new WP_Error('openai_api_error', $msg, ['status' => max(400, $code ?: 500)]);
        }
    }
    return new WP_Error('openai_fail','Could not reach the AI service or the response was invalid.', ['status'=>502]);
}

/** --------------------- Low-level POST calls + parsing -------------------- */

/**
 * Chat Completions.
 * Returns:
 *   ['ok'=>true, 'reply'=>string] on success
 *   ['error'=>string, 'code'=>int] on API error or transport failure
 */
function qa_openai_post_chat(array $payload, string $api_key) {
    $resp = wp_remote_post(
        'https://api.openai.com/v1/chat/completions',
        [
            'timeout'    => 45,
            'headers'    => [
                'Authorization' => "Bearer {$api_key}",
                'Content-Type'  => 'application/json',
            ],
            'body'       => wp_json_encode($payload),
            'user-agent' => 'QuizAssist/2.6; (+https://farhat-lectures.local)',
        ]
    );

    if (is_wp_error($resp)) {
        qa_log("WP_ERROR ► " . $resp->get_error_message());
        return ['error' => $resp->get_error_message(), 'code' => 0];
    }

    $code = (int) wp_remote_retrieve_response_code($resp);
    $body = (string) wp_remote_retrieve_body($resp);
    qa_log("RAW OPENAI CHAT ({$code}) ► " . substr($body,0,6000));

    $j = json_decode($body, true);

    if ($code >= 200 && $code < 300 && is_array($j) && isset($j['choices'])) {
        $reply = qa_extract_text_from_choices($j['choices']);
        if (trim($reply) !== '') {
            return ['ok' => true, 'reply' => $reply];
        }
        return ['error' => 'Empty completion text', 'code' => $code];
    }

    $err_msg = is_array($j) && isset($j['error']['message']) ? (string) $j['error']['message'] : 'Unknown API error';
    return ['error' => $err_msg, 'code' => $code];
}

/**
 * Responses API.
 * Returns:
 *   ['ok'=>true, 'reply'=>string] on success
 *   ['error'=>string, 'code'=>int] on API error or transport failure
 */
function qa_openai_post_responses(array $payload, string $api_key) {
    $resp = wp_remote_post(
        'https://api.openai.com/v1/responses',
        [
            'timeout'    => 60,
            'headers'    => [
                'Authorization' => "Bearer {$api_key}",
                'Content-Type'  => 'application/json',
            ],
            'body'       => wp_json_encode($payload),
            'user-agent' => 'QuizAssist/2.6; (+https://farhat-lectures.local)',
        ]
    );

    if (is_wp_error($resp)) {
        qa_log("WP_ERROR ► " . $resp->get_error_message());
        return ['error' => $resp->get_error_message(), 'code' => 0];
    }

    $code = (int) wp_remote_retrieve_response_code($resp);
    $body = (string) wp_remote_retrieve_body($resp);
    qa_log("RAW OPENAI RESPONSES ({$code}) ► " . substr($body,0,6000));

    $j = json_decode($body, true);

    if ($code >= 200 && $code < 300 && is_array($j)) {
        // 1) Convenience fields sometimes exist
        if (!empty($j['output_text']) && is_string($j['output_text'])) {
            $txt = trim($j['output_text']);
            if ($txt !== '') return ['ok'=>true,'reply'=>$txt];
        }

        // 2) Newer schema: output[0] → message → content[] (type: output_text)
        $txt = qa_extract_text_from_responses($j);
        if (trim($txt) !== '') return ['ok'=>true,'reply'=>$txt];

        return ['error' => 'Empty completion text', 'code' => $code];
    }

    $err_msg = is_array($j) && isset($j['error']['message']) ? (string) $j['error']['message'] : 'Unknown API error';
    return ['error' => $err_msg, 'code' => $code];
}

/** ---------------------- Text extraction utilities ----------------------- */

/**
 * Robust text extraction for CHAT completions.
 */
function qa_extract_text_from_choice($choice) {
    if (!is_array($choice)) return '';
    $m = isset($choice['message']) ? $choice['message'] : $choice;

    // 1) String content
    if (isset($m['content']) && is_string($m['content'])) {
        $t = trim($m['content']);
        if ($t !== '') return $t;
    }

    // 2) Array content (segments)
    if (isset($m['content']) && is_array($m['content'])) {
        $buf = '';
        foreach ($m['content'] as $part) {
            if (is_string($part)) { $buf .= $part; continue; }
            if (is_array($part)) {
                if (isset($part['text'])    && is_string($part['text']))    $buf .= $part['text'];
                elseif (isset($part['content']) && is_string($part['content'])) $buf .= $part['content'];
                elseif (isset($part['type']) && $part['type']==='output_text' && isset($part['text'])) $buf .= (string)$part['text'];
            }
        }
        $buf = trim($buf);
        if ($buf !== '') return $buf;
    }

    // 3) Refusal/fallback text
    if (isset($m['refusal']) && is_string($m['refusal'])) {
        $t = trim($m['refusal']);
        if ($t !== '') return $t;
    }

    // 4) Tool call hint
    if (isset($m['tool_calls']) && is_array($m['tool_calls']) && count($m['tool_calls']) > 0) {
        return 'The assistant attempted a tool call, which is not supported in this widget.';
    }

    // 5) Some responses put text at choice-level 'content'
    if (isset($choice['content'])) {
        if (is_string($choice['content'])) {
            $t = trim($choice['content']); if ($t!=='') return $t;
        } elseif (is_array($choice['content'])) {
            $buf = '';
            foreach ($choice['content'] as $part) {
                if (is_string($part)) $buf .= $part;
                elseif (is_array($part) && isset($part['text'])) $buf .= $part['text'];
            }
            $buf = trim($buf); if ($buf!=='') return $buf;
        }
    }

    return '';
}

function qa_extract_text_from_choices($choices) {
    if (!is_array($choices)) return '';
    foreach ($choices as $c) {
        $t = qa_extract_text_from_choice($c);
        if (trim($t) !== '') return $t;
    }
    return '';
}

/**
 * Robust text extraction for RESPONSES API payloads.
 * We look across: output[].message.content[].text | content[].text | output_text.
 */
function qa_extract_text_from_responses(array $j) {
    // Convenience field
    if (isset($j['output_text']) && is_string($j['output_text'])) {
        $t = trim($j['output_text']); if ($t!=='') return $t;
    }

    // output[] → message → content[] (type: output_text | text)
    if (isset($j['output']) && is_array($j['output'])) {
        $buf = '';
        foreach ($j['output'] as $node) {
            if (isset($node['type']) && $node['type']==='message' && isset($node['content']) && is_array($node['content'])) {
                foreach ($node['content'] as $part) {
                    if (is_string($part)) { $buf .= $part; continue; }
                    if (is_array($part)) {
                        if (isset($part['text']) && is_string($part['text'])) $buf .= $part['text'];
                        elseif (isset($part['content']) && is_string($part['content'])) $buf .= $part['content'];
                    }
                }
            }
            if (isset($node['message']['content']) && is_array($node['message']['content'])) {
                foreach ($node['message']['content'] as $part) {
                    if (isset($part['text']) && is_string($part['text'])) $buf .= $part['text'];
                }
            }
        }
        $buf = trim($buf); if ($buf!=='') return $buf;
    }

    // Some variants: direct 'content' at top-level message
    if (isset($j['message']['content']) && is_array($j['message']['content'])) {
        $buf = '';
        foreach ($j['message']['content'] as $part) {
            if (isset($part['text']) && is_string($part['text'])) $buf .= $part['text'];
            elseif (is_string($part)) $buf .= $part;
        }
        $buf = trim($buf); if ($buf!=='') return $buf;
    }

    // Last resort: scan recursively for any {type: 'output_text', text: '...'}
    $stack = [$j];
    $collect = '';
    while ($stack) {
        $node = array_pop($stack);
        if (is_array($node)) {
            if (isset($node['type']) && in_array($node['type'], ['output_text','text'], true) && isset($node['text'])) {
                $collect .= (string)$node['text'];
            }
            foreach ($node as $v) if (is_array($v)) $stack[] = $v;
        }
    }
    return trim($collect);
}
