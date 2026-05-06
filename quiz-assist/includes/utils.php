<?php
if ( ! defined( 'ABSPATH' ) ) exit;

// Logging helper (disabled by default).
function qa_log( $msg ) {
    if ( defined('QA_DEBUG') && QA_DEBUG ) {
        $file = QA_DIR . 'quiz-assist-debug.log';
        @file_put_contents( $file, date('[Y-m-d H:i:s] ') . print_r($msg, true) . "\n", FILE_APPEND );
    }
}

// Get stored API key
function qa_get_api_key() {
    $opts = get_option('quiz_assist_options', []);
    return trim( $opts['qa_openai_key'] ?? '' );
}

// Get a prompt template by key (quiz or global)
function qa_get_prompt( $key ) {
    $opts = get_option('quiz_assist_options', []);
    return trim( $opts[$key] ?? '' );
}
