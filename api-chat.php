<?php
if ( ! defined('ABSPATH') ) exit;

add_action( 'rest_api_init', function(){
    register_rest_route( 'quiz-assist/v1', '/chat/start', [
        'methods'             => 'POST',
        'callback'            => 'qa_chat_start',
        'permission_callback' => '__return_true',
    ]);
    register_rest_route( 'quiz-assist/v1', '/chat/send', [
        'methods'             => 'POST',
        'callback'            => 'qa_chat_send',
        'permission_callback' => '__return_true',
    ]);
    register_rest_route( 'quiz-assist/v1', '/chat/messages', [
        'methods'             => 'GET',
        'callback'            => 'qa_chat_get_messages',
        'permission_callback' => '__return_true',
    ]);
    register_rest_route( 'quiz-assist/v1', '/chat/sessions', [
        'methods'             => 'GET',
        'callback'            => 'qa_chat_get_sessions',
        'permission_callback' => '__return_true',
    ]);
});

/**
 * Return all chat sessions with last_message_time & unread_count.
 */
function qa_chat_get_sessions( WP_REST_Request $req ) {
    global $wpdb;
    $sess = $wpdb->prefix . 'qa_chat_sessions';
    $msg  = $wpdb->prefix . 'qa_chat_messages';
    $rows = $wpdb->get_results( "
        SELECT
          s.id,
          MAX(m.created_at)  AS last_message_time,
          SUM(CASE WHEN m.sender='user' AND m.is_read=0 THEN 1 ELSE 0 END) AS unread_count
        FROM {$sess} s
        JOIN {$msg} m ON m.session_id = s.id
        GROUP BY s.id
        ORDER BY last_message_time DESC
    " );
    $out = [];
    foreach ( $rows as $r ) {
        $out[] = [
            'id'                => (int)$r->id,
            'last_message_time' => $r->last_message_time,
            'unread_count'      => (int)$r->unread_count,
        ];
    }
    return [ 'sessions' => $out ];
}

/**
 * Start a new chat session.
 */
function qa_chat_start( WP_REST_Request $req ) {
    global $wpdb;
    $table = $wpdb->prefix . 'qa_chat_sessions';
    $wpdb->insert( $table, [ 'created_at' => current_time('mysql') ], [ '%s' ] );
    return [ 'session_id' => (string)$wpdb->insert_id ];
}

/**
 * Send a message in a session.
 */
function qa_chat_send( WP_REST_Request $req ) {
    global $wpdb;
    $p          = $req->get_json_params();
    $session_id = intval( $p['session_id'] ?? 0 );
    $message    = sanitize_text_field( $p['message'] ?? '' );

    if ( ! $session_id || $message === '' ) {
        return new WP_Error( 'invalid_data','Session ID and message required',['status'=>400] );
    }

    $table = $wpdb->prefix . 'qa_chat_messages';
    $wpdb->insert( $table, [
        'session_id' => $session_id,
        'sender'     => 'user',
        'message'    => $message,
        'created_at' => current_time('mysql'),
        'is_read'    => 0
    ], [ '%d','%s','%s','%s','%d' ] );

    return [ 'success' => true ];
}

/**
 * Retrieve all messages for a session.
 */
function qa_chat_get_messages( WP_REST_Request $req ) {
    global $wpdb;
    $session_id = intval( $req->get_param('session_id') ?? 0 );
    if ( ! $session_id ) {
        return new WP_Error( 'no_session','session_id required',['status'=>400] );
    }

    $rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT sender, message, created_at
         FROM {$wpdb->prefix}qa_chat_messages
         WHERE session_id = %d
         ORDER BY created_at ASC",
        $session_id
    ) );

    $out = [];
    foreach ( $rows as $r ) {
        $out[] = [
            'sender'     => $r->sender,
            'message'    => $r->message,
            'created_at' => $r->created_at,
        ];
    }
    return [ 'messages' => $out ];
}
