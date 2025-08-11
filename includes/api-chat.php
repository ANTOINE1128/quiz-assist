<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Register REST endpoints and ensure WP tries cookie+nonce auth
 * so get_current_user_id() works for logged-in users.
 */
add_action( 'rest_api_init', function () {

    $permission = function( WP_REST_Request $req ) {
        // Trigger WP auth (does not block guests)
        rest_cookie_check_errors( $req );
        return true;
    };

    register_rest_route( 'quiz-assist/v1', '/chat/start', [
        'methods'             => 'POST',
        'callback'            => 'qa_chat_start',
        'permission_callback' => $permission,
    ] );

    register_rest_route( 'quiz-assist/v1', '/chat/send', [
        'methods'             => 'POST',
        'callback'            => 'qa_chat_send',
        'permission_callback' => $permission,
    ] );

    register_rest_route( 'quiz-assist/v1', '/chat/messages', [
        'methods'             => 'GET',
        'callback'            => 'qa_chat_get_messages',
        'permission_callback' => $permission,
    ] );

    // Admin-only Sessions list
    register_rest_route( 'quiz-assist/v1', '/chat/sessions', [
        'methods'             => 'GET',
        'callback'            => 'qa_chat_get_sessions',
        'permission_callback' => function() { return current_user_can('manage_options'); },
    ] );

    // FAQs for the widget
    register_rest_route( 'quiz-assist/v1', '/chat/faqs', [
        'methods'             => 'GET',
        'callback'            => 'qa_chat_get_faqs',
        'permission_callback' => '__return_true',
    ] );
} );

/**
 * Create or reuse a chat session.
 */
function qa_chat_start( WP_REST_Request $req ) {
    global $wpdb;
    $sess_table = $wpdb->prefix . 'qa_chat_sessions';

    // Detect current user
    $user_id = get_current_user_id();

    if ( $user_id ) {
        // Reuse newest session
        $existing_id = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$sess_table} WHERE user_id=%d ORDER BY id DESC LIMIT 1",
            $user_id
        ) );
        if ( $existing_id ) {
            return [ 'session_id' => (string) $existing_id ];
        }

        $wpdb->insert( $sess_table, [
            'created_at'  => current_time( 'mysql' ),
            'user_id'     => $user_id,
            'guest_name'  => '',
            'guest_email' => '',
            'guest_phone' => '',
        ], [ '%s','%d','%s','%s','%s' ] );

        return [ 'session_id' => (string) $wpdb->insert_id ];
    }

    // Guest path
    $p = (array) $req->get_json_params();
    $guest_name  = sanitize_text_field( $p['guest_name']  ?? '' );
    $guest_email = sanitize_email(      $p['guest_email'] ?? '' );
    $guest_phone = sanitize_text_field( $p['guest_phone'] ?? '' );

    if ( $guest_name === '' || $guest_email === '' || $guest_phone === '' ) {
        return new WP_Error(
            'missing_fields',
            'Guest name, email and phone are required.',
            [ 'status' => 400 ]
        );
    }

    // Reuse latest session by guest email if present
    $existing_id = $wpdb->get_var( $wpdb->prepare(
        "SELECT id FROM {$sess_table} WHERE user_id=0 AND guest_email=%s ORDER BY id DESC LIMIT 1",
        $guest_email
    ) );
    if ( $existing_id ) {
        return [ 'session_id' => (string) $existing_id ];
    }

    $wpdb->insert( $sess_table, [
        'created_at'  => current_time( 'mysql' ),
        'user_id'     => 0,
        'guest_name'  => $guest_name,
        'guest_email' => $guest_email,
        'guest_phone' => $guest_phone,
    ], [ '%s','%d','%s','%s','%s' ] );

    return [ 'session_id' => (string) $wpdb->insert_id ];
}

/** Send a message. Refuses if session doesn’t exist. */
function qa_chat_send( WP_REST_Request $req ) {
    global $wpdb;

    $p          = (array) $req->get_json_params();
    $session_id = intval( $p['session_id'] ?? 0 );
    $message    = sanitize_text_field( $p['message'] ?? '' );

    if ( ! $session_id || $message === '' ) {
        return new WP_Error( 'invalid_data', 'Session ID and message required.', [ 'status' => 400 ] );
    }

    $sess_table = $wpdb->prefix . 'qa_chat_sessions';
    $exists     = $wpdb->get_var( $wpdb->prepare(
        "SELECT id FROM {$sess_table} WHERE id=%d LIMIT 1",
        $session_id
    ) );
    if ( ! $exists ) {
        return new WP_Error( 'no_session', 'Session not found or closed.', [ 'status' => 410 ] );
    }

    $msgs_table = $wpdb->prefix . 'qa_chat_messages';
    $wpdb->insert( $msgs_table, [
        'session_id' => $session_id,
        'sender'     => 'user',
        'message'    => $message,
        'created_at' => current_time( 'mysql' ),
        'is_read'    => 0,
    ], [ '%d','%s','%s','%s','%d' ] );

    return [ 'success' => true ];
}

/** Get messages for a session. */
function qa_chat_get_messages( WP_REST_Request $req ) {
    global $wpdb;

    $session_id = intval( $req->get_param( 'session_id' ) ?? 0 );
    if ( ! $session_id ) {
        return new WP_Error( 'no_session', 'session_id required.', [ 'status' => 400 ] );
    }

    $sess_table = $wpdb->prefix . 'qa_chat_sessions';
    $exists     = $wpdb->get_var( $wpdb->prepare(
        "SELECT id FROM {$sess_table} WHERE id=%d LIMIT 1",
        $session_id
    ) );
    if ( ! $exists ) {
        return new WP_Error( 'no_session', 'Session not found or closed.', [ 'status' => 410 ] );
    }

    $msgs_table = $wpdb->prefix . 'qa_chat_messages';
    $rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT sender, message, created_at
         FROM {$msgs_table}
         WHERE session_id=%d
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

/** Sessions list for the admin view (joined with wp_users) */
function qa_chat_get_sessions( WP_REST_Request $req ) {
    global $wpdb;

    $sess  = $wpdb->prefix . 'qa_chat_sessions';
    $msg   = $wpdb->prefix . 'qa_chat_messages';
    $users = $wpdb->users;

    $rows = $wpdb->get_results("
        SELECT
            s.id,
            s.created_at,
            s.user_id,
            u.user_login,
            u.user_email,
            s.guest_name,
            s.guest_email,
            s.guest_phone,
            COALESCE(MAX(m.created_at), s.created_at) AS last_message_time,
            COALESCE(SUM(CASE WHEN m.sender='user' AND m.is_read=0 THEN 1 ELSE 0 END), 0) AS unread_count
        FROM {$sess} s
        LEFT JOIN {$msg} m   ON m.session_id = s.id
        LEFT JOIN {$users} u ON u.ID = s.user_id
        GROUP BY s.id
        ORDER BY last_message_time DESC
    ");

    $out = [];
    foreach ( $rows as $r ) {
        $out[] = [
            'id'                => (int) $r->id,
            'user_id'           => (int) $r->user_id,
            'user_login'        => $r->user_login,
            'user_email'        => $r->user_email,
            'guest_name'        => $r->guest_name,
            'guest_email'       => $r->guest_email,
            'guest_phone'       => $r->guest_phone,
            'last_message_time' => $r->last_message_time,
            'unread_count'      => (int) $r->unread_count,
        ];
    }

    return [ 'sessions' => $out ];
}

/** Return FAQs */
function qa_chat_get_faqs( WP_REST_Request $req ) {
  $opts = get_option( 'quiz_assist_options', [] );
  $faqs = $opts['qa_faqs'] ?? [];
  $out  = [];
  foreach ( $faqs as $i => $f ) {
    $out[] = [
      'id'       => $i,
      'question' => (string) ( $f['q'] ?? '' ),
      'answer'   => (string) ( $f['a'] ?? '' ),
    ];
  }
  return [ 'faqs' => $out ];
}
