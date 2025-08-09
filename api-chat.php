<?php
if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function(){
    register_rest_route( 'quiz-assist/v1', '/chat/start', [
        'methods'             => 'POST',
        'callback'            => 'qa_chat_start',
        'permission_callback' => '__return_true',
    ] );
    register_rest_route( 'quiz-assist/v1', '/chat/send', [
        'methods'             => 'POST',
        'callback'            => 'qa_chat_send',
        'permission_callback' => '__return_true',
    ] );
    register_rest_route( 'quiz-assist/v1', '/chat/messages', [
        'methods'             => 'GET',
        'callback'            => 'qa_chat_get_messages',
        'permission_callback' => '__return_true',
    ] );
    register_rest_route( 'quiz-assist/v1', '/chat/sessions', [
        'methods'             => 'GET',
        'callback'            => 'qa_chat_get_sessions',
        'permission_callback' => '__return_true',
    ] );
});

/** Helper: does session exist? */
function qa_session_exists( $session_id ) {
    global $wpdb;
    $sess = $wpdb->prefix . 'qa_chat_sessions';
    return (bool) $wpdb->get_var( $wpdb->prepare(
        "SELECT COUNT(*) FROM {$sess} WHERE id=%d",
        $session_id
    ) );
}

/**
 * Start a new chat session, storing user or guest metadata.
 * (If user logged in: no payload required)
 * (If guest: name+email+phone are required)
 */
function qa_chat_start( WP_REST_Request $req ) {
    global $wpdb;

    $user_id = get_current_user_id();
    $guest_name  = '';
    $guest_phone = '';
    $guest_email = '';

    if ( ! $user_id ) {
        $p = $req->get_json_params();
        $guest_name  = sanitize_text_field( $p['guest_name']  ?? '' );
        $guest_phone = sanitize_text_field( $p['guest_phone'] ?? '' );
        $guest_email = sanitize_email(      $p['guest_email'] ?? '' );

        if ( empty($guest_name) || empty($guest_email) || empty($guest_phone) ) {
            return new WP_Error( 'missing_fields',
                'Guest name, email and phone are required.',
                [ 'status' => 400 ]
            );
        }
    }

    $sess = $wpdb->prefix . 'qa_chat_sessions';
    $wpdb->insert( $sess, [
        'created_at'  => current_time( 'mysql' ),
        'user_id'     => $user_id,
        'guest_name'  => $guest_name,
        'guest_phone' => $guest_phone,
        'guest_email' => $guest_email,
    ], [ '%s','%d','%s','%s','%s' ] );

    return [ 'session_id' => (string) $wpdb->insert_id ];
}

/**
 * Send a message
 */
function qa_chat_send( WP_REST_Request $req ) {
    global $wpdb;
    $p          = $req->get_json_params();
    $session_id = intval( $p['session_id'] ?? 0 );
    $message    = sanitize_text_field( $p['message'] ?? '' );

    if ( ! $session_id || $message === '' ) {
        return new WP_Error( 'invalid_data',
            'Session ID and message required',
            [ 'status' => 400 ]
        );
    }

    // NEW: stop if session no longer exists
    if ( ! qa_session_exists( $session_id ) ) {
        return new WP_Error( 'no_session',
            'Session not found',
            [ 'status' => 404 ]
        );
    }

    $msgs = $wpdb->prefix . 'qa_chat_messages';
    $wpdb->insert( $msgs, [
        'session_id' => $session_id,
        'sender'     => 'user',
        'message'    => $message,
        'created_at' => current_time( 'mysql' ),
        'is_read'    => 0,
    ], [ '%d','%s','%s','%s','%d' ] );

    return [ 'success' => true ];
}

/**
 * Retrieve messages
 */
function qa_chat_get_messages( WP_REST_Request $req ) {
    global $wpdb;
    $session_id = intval( $req->get_param('session_id') ?? 0 );
    if ( ! $session_id ) {
        return new WP_Error( 'no_session', 'session_id required', [ 'status' => 400 ] );
    }

    // NEW: stop if session no longer exists
    if ( ! qa_session_exists( $session_id ) ) {
        return new WP_Error( 'no_session', 'Session not found', [ 'status' => 404 ] );
    }

    $msgs = $wpdb->prefix . 'qa_chat_messages';
    $rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT sender, message, created_at
         FROM {$msgs}
         WHERE session_id=%d
         ORDER BY created_at ASC",
        $session_id
    ) );
    $out  = [];
    foreach ( $rows as $r ) {
        $out[] = [
            'sender'     => $r->sender,
            'message'    => $r->message,
            'created_at' => $r->created_at,
        ];
    }
    return [ 'messages' => $out ];
}

/**
 * Return sessions (admin list)
 */
function qa_chat_get_sessions( WP_REST_Request $req ) {
    global $wpdb;
    $sess = $wpdb->prefix . 'qa_chat_sessions';
    $msg  = $wpdb->prefix . 'qa_chat_messages';
    $rows = $wpdb->get_results( "
        SELECT
            s.id,
            MAX(m.created_at) AS last_message_time,
            SUM(CASE WHEN m.sender='user' AND m.is_read=0 THEN 1 ELSE 0 END) AS unread_count
        FROM {$sess} s
        JOIN {$msg} m ON m.session_id = s.id
        GROUP BY s.id
        ORDER BY last_message_time DESC
        LIMIT 200
    " );
    $out  = [];
    foreach ( $rows as $r ) {
        $out[] = [
            'id'                 => (int)$r->id,
            'last_message_time'  => $r->last_message_time,
            'unread_count'       => (int)$r->unread_count,
        ];
    }
    return [ 'sessions' => $out ];
}
