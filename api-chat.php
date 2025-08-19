<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * REST routes
 */
add_action( 'rest_api_init', function () {

    // ---- Public (guest or logged-in) ----
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

    register_rest_route( 'quiz-assist/v1', '/chat/faqs', [
        'methods'             => 'GET',
        'callback'            => 'qa_chat_get_faqs',
        'permission_callback' => '__return_true',
    ] );

    // Public config for the widget (bypasses page cache)
    register_rest_route( 'quiz-assist/v1', '/public-config', [
        'methods'             => 'GET',
        'callback'            => 'qa_chat_get_config',
        'permission_callback' => '__return_true',
    ] );

    // ---- Admin-only ----
    register_rest_route( 'quiz-assist/v1', '/chat/sessions', [
        'methods'             => 'GET',
        'callback'            => 'qa_chat_get_sessions',
        'permission_callback' => function(){ return current_user_can( 'manage_options' ); },
    ] );

    register_rest_route( 'quiz-assist/v1', '/chat/session', [
        'methods'             => 'GET',
        'callback'            => 'qa_chat_get_session_meta',
        'permission_callback' => function(){ return current_user_can( 'manage_options' ); },
    ] );

    register_rest_route( 'quiz-assist/v1', '/chat/admin/send', [
        'methods'             => 'POST',
        'callback'            => 'qa_chat_admin_send',
        'permission_callback' => function(){ return current_user_can( 'manage_options' ); },
    ] );

} );

/** ============================================================
 * Helpers: rate limiting + lightweight guest fingerprint binding
 * ============================================================ */

function qa_ip() {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
    return preg_replace('/[^0-9a-fA-F:.]/', '', $ip);
}
function qa_rl_key( $suffix ) { return 'qa_rl_' . $suffix; }
function qa_rate_limit( $key_suffix, $max, $window_seconds ) {
    $k   = qa_rl_key( $key_suffix );
    $val = get_transient( $k );
    $cnt = intval( $val ?: 0 );
    if ( $cnt >= $max ) return false;
    set_transient( $k, $cnt + 1, $window_seconds );
    return true;
}
function qa_fp_key( $sid ) { return 'qa_fp_' . intval($sid); }
function qa_client_fingerprint() {
    $ua = isset($_SERVER['HTTP_USER_AGENT']) ? wp_unslash($_SERVER['HTTP_USER_AGENT']) : '';
    $ua = substr( (string) $ua, 0, 300 );
    return hash_hmac( 'sha256', $ua, wp_salt('auth') );
}
function qa_set_guest_fp( $sid ) {
    set_transient( qa_fp_key($sid), qa_client_fingerprint(), 12 * HOUR_IN_SECONDS );
}
function qa_check_guest_fp( $session_user_id, $sid ) {
    if ( intval($session_user_id) > 0 ) return true;
    $need = get_transient( qa_fp_key($sid) );
    if ( ! $need ) { qa_set_guest_fp( $sid ); return true; }
    $got = qa_client_fingerprint();
    if ( hash_equals( $need, $got ) ) return true;
    return new WP_Error( 'forbidden', 'Session fingerprint mismatch.', [ 'status' => 403 ] );
}

/**
 * Access control: ensure current viewer can access this session.
 * - Logged-in session: must be the same user.
 * - Guest session: must NOT be logged in and must match fingerprint.
 */
function qa_can_access_session( $row ) {
    $current = get_current_user_id();
    $row_uid = (int) $row->user_id;
    $sid     = (int) $row->id;

    if ( $row_uid > 0 ) {
        if ( $current !== $row_uid ) {
            return new WP_Error( 'forbidden', 'This chat belongs to a different user.', [ 'status' => 403 ] );
        }
        return true; // owner ok
    }

    // guest session
    if ( $current > 0 ) {
        return new WP_Error( 'forbidden', 'This guest chat cannot be accessed while logged in.', [ 'status' => 403 ] );
    }
    return qa_check_guest_fp( 0, $sid );
}

/** =========================
 * Create or reuse a session
 * ========================= */
function qa_chat_start( WP_REST_Request $req ) {
    global $wpdb;

    $sess_table = $wpdb->prefix . 'qa_chat_sessions';
    $user_id    = get_current_user_id();

    if ( $user_id ) {
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

    // guests: throttle per IP + always create fresh session
    $ip = qa_ip();
    if ( ! qa_rate_limit( 'start_' . md5($ip), 8, 60 ) ) {
        return new WP_Error( 'rate_limited', 'Too many new chats from this IP. Please wait a minute.', [ 'status' => 429 ] );
    }

    $p = (array) $req->get_json_params();
    $guest_name  = sanitize_text_field( $p['guest_name']  ?? '' );
    $guest_email = sanitize_email(      $p['guest_email'] ?? '' );
    $guest_phone = sanitize_text_field( $p['guest_phone'] ?? '' );

    if ( $guest_name === '' || $guest_email === '' || $guest_phone === '' ) {
        return new WP_Error( 'missing_fields', 'Guest name, email and phone are required.', [ 'status' => 400 ] );
    }

    $wpdb->insert( $sess_table, [
        'created_at'  => current_time( 'mysql' ),
        'user_id'     => 0,
        'guest_name'  => $guest_name,
        'guest_email' => $guest_email,
        'guest_phone' => $guest_phone,
    ], [ '%s','%d','%s','%s','%s' ] );

    $sid = (int) $wpdb->insert_id;
    qa_set_guest_fp( $sid );
    return [ 'session_id' => (string) $sid ];
}

/** ===============
 * Send a message
 * =============== */
function qa_chat_send( WP_REST_Request $req ) {
    global $wpdb;

    $p          = (array) $req->get_json_params();
    $session_id = intval( $p['session_id'] ?? 0 );
    $message    = function_exists('sanitize_textarea_field')
                    ? sanitize_textarea_field( $p['message'] ?? '' )
                    : sanitize_text_field( $p['message'] ?? '' );

    if ( ! $session_id || $message === '' ) {
        return new WP_Error( 'invalid_data', 'Session ID and message required.', [ 'status' => 400 ] );
    }

    $sess_table = $wpdb->prefix . 'qa_chat_sessions';
    $row        = $wpdb->get_row( $wpdb->prepare(
        "SELECT id, user_id FROM {$sess_table} WHERE id=%d LIMIT 1",
        $session_id
    ) );
    if ( ! $row ) {
        return new WP_Error( 'no_session', 'Session not found or closed.', [ 'status' => 410 ] );
    }

    $ok = qa_can_access_session( $row );
    if ( is_wp_error( $ok ) ) return $ok;

    if ( ! qa_rate_limit( 'send_sid_' . $session_id, 3, 2 ) ) {
        return new WP_Error( 'rate_limited', 'Too many messages. Please wait a moment.', [ 'status' => 429 ] );
    }

    $msgs_table = $wpdb->prefix . 'qa_chat_messages';
    $wpdb->insert( $msgs_table, [
        'session_id' => $session_id,
        'sender'     => ( get_current_user_id() ? 'user' : 'user' ), // both appear as 'user' in the timeline
        'message'    => $message,
        'created_at' => current_time( 'mysql' ),
        'is_read'    => 0,
    ], [ '%d','%s','%s','%s','%d' ] );

    return [ 'success' => true ];
}

/** ==========================
 * Get messages for a session
 * ========================== */
function qa_chat_get_messages( WP_REST_Request $req ) {
    global $wpdb;

    $session_id = intval( $req->get_param( 'session_id' ) ?? 0 );
    $limit      = intval( $req->get_param( 'limit' ) ?? 100 );
    if ( $limit < 1 )   $limit = 1;
    if ( $limit > 200 ) $limit = 200;

    if ( ! $session_id ) {
        return new WP_Error( 'no_session', 'session_id required.', [ 'status' => 400 ] );
    }

    $sess_table = $wpdb->prefix . 'qa_chat_sessions';
    $row        = $wpdb->get_row( $wpdb->prepare(
        "SELECT id, user_id FROM {$sess_table} WHERE id=%d LIMIT 1",
        $session_id
    ) );
    if ( ! $row ) {
        return new WP_Error( 'no_session', 'Session not found or closed.', [ 'status' => 410 ] );
    }

    $ok = qa_can_access_session( $row );
    if ( is_wp_error( $ok ) ) return $ok;

    if ( ! qa_rate_limit( 'msgs_sid_' . $session_id, 2, 1 ) ) {
        nocache_headers();
        return [ 'messages' => [] ];
    }

    $msgs_table = $wpdb->prefix . 'qa_chat_messages';
    nocache_headers();

    $rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT sender, message, created_at
         FROM {$msgs_table}
         WHERE session_id=%d
         ORDER BY id DESC
         LIMIT %d",
        $session_id, $limit
    ) );

    $rows = array_reverse( $rows );
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

/** ==========================
 * Sessions list (admin view)
 * ========================== */
function qa_chat_get_sessions( WP_REST_Request $req ) {
    global $wpdb;

    $sess = $wpdb->prefix . 'qa_chat_sessions';
    $msg  = $wpdb->prefix . 'qa_chat_messages';
    $usr  = $wpdb->users;

    $rows = $wpdb->get_results("
        SELECT
            s.id,
            s.user_id,
            s.guest_name,
            s.guest_email,
            s.guest_phone,
            u.user_login,
            u.user_email,
            MAX(m.id) AS last_msg_id,
            MAX(m.created_at) AS last_message_time,
            SUM(CASE WHEN m.sender='user' AND m.is_read=0 THEN 1 ELSE 0 END) AS unread_count
        FROM {$sess} s
        LEFT JOIN {$msg} m ON m.session_id = s.id
        LEFT JOIN {$usr} u ON u.ID = s.user_id
        GROUP BY s.id
        ORDER BY last_msg_id DESC
    ");

    $out = [];
    foreach ( $rows as $r ) {
        $out[] = [
            'id'                => (int) $r->id,
            'user_id'           => (int) $r->user_id,
            'guest_name'        => $r->guest_name,
            'guest_email'       => $r->guest_email,
            'guest_phone'       => $r->guest_phone,
            'user_login'        => $r->user_login,
            'user_email'        => $r->user_email,
            'last_message_time' => $r->last_message_time,
            'unread_count'      => (int) $r->unread_count,
        ];
    }
    return [ 'sessions' => $out ];
}

/** ===========================
 * Single session meta (admin)
 * =========================== */
function qa_chat_get_session_meta( WP_REST_Request $req ) {
    global $wpdb;

    $session_id = intval( $req->get_param( 'session_id' ) ?? 0 );
    if ( ! $session_id ) {
        return new WP_Error( 'no_session', 'session_id required.', [ 'status' => 400 ] );
    }

    $sess = $wpdb->prefix . 'qa_chat_sessions';
    $usr  = $wpdb->users;

    $row = $wpdb->get_row( $wpdb->prepare("
        SELECT s.id, s.user_id, s.guest_name, s.guest_email, s.guest_phone,
               u.user_login, u.user_email
        FROM {$sess} s
        LEFT JOIN {$usr} u ON u.ID = s.user_id
        WHERE s.id=%d
        LIMIT 1
    ", $session_id ) );

    if ( ! $row ) {
        return new WP_Error( 'no_session', 'Session not found.', [ 'status' => 404 ] );
    }

    return [
        'session' => [
            'id'          => (int) $row->id,
            'user_id'     => (int) $row->user_id,
            'guest_name'  => (string) $row->guest_name,
            'guest_email' => (string) $row->guest_email,
            'guest_phone' => (string) $row->guest_phone,
            'user_login'  => (string) $row->user_login,
            'user_email'  => (string) $row->user_email,
        ]
    ];
}

/** ==================
 * Admin sends a msg
 * ================== */
function qa_chat_admin_send( WP_REST_Request $req ) {
    if ( ! current_user_can( 'manage_options' ) ) {
        return new WP_Error( 'forbidden', 'Not allowed.', [ 'status' => 403 ] );
    }

    global $wpdb;

    $p          = (array) $req->get_json_params();
    $session_id = intval( $p['session_id'] ?? 0 );
    $raw_msg    = (string) ( $p['message'] ?? '' );
    $message    = function_exists( 'sanitize_textarea_field' )
        ? sanitize_textarea_field( $raw_msg )
        : sanitize_text_field( $raw_msg );

    if ( ! $session_id || $message === '' ) {
        return new WP_Error( 'invalid_data', 'Session ID and message required.', [ 'status' => 400 ] );
    }

    $sess_table = $wpdb->prefix . 'qa_chat_sessions';
    $exists     = $wpdb->get_var( $wpdb->prepare(
        "SELECT id FROM {$sess_table} WHERE id=%d LIMIT 1",
        $session_id
    ) );
    if ( ! $exists ) {
        return new WP_Error( 'no_session', 'Session not found.', [ 'status' => 404 ] );
    }

    $msgs_table = $wpdb->prefix . 'qa_chat_messages';
    $wpdb->insert( $msgs_table, [
        'session_id' => $session_id,
        'sender'     => 'admin',
        'message'    => $message,
        'created_at' => current_time( 'mysql' ),
        'is_read'    => 1,
    ], [ '%d','%s','%s','%s','%d' ] );

    return [ 'success' => true ];
}

/**
 * Public config for the widget
 */
function qa_chat_get_config( WP_REST_Request $req ) {
    nocache_headers();
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('X-Cache-Bypass: 1');

    $opts = get_option( 'quiz_assist_options', [] );

    $is_logged_in = is_user_logged_in();
    $user_name    = $is_logged_in ? wp_get_current_user()->display_name : '';

    $widget_enabled = ! isset( $opts['qa_enable_global_chat'] ) || ! empty( $opts['qa_enable_global_chat'] );

    return [
        'apiBase'         => rtrim( get_rest_url( null, 'quiz-assist/v1' ), '/' ),
        'pollInterval'    => 2000,
        'isUserLoggedIn'  => (bool) $is_logged_in,
        'currentUserName' => (string) $user_name,
        'restNonce'       => $is_logged_in ? wp_create_nonce( 'wp_rest' ) : '',
        'globalActions'   => isset($opts['qa_global_actions']) && is_array($opts['qa_global_actions'])
                              ? array_values($opts['qa_global_actions'])
                              : [],
        'calendlyUrl'     => trim( $opts['qa_calendly_url'] ?? '' ),
        'publicHeader'    => '',
        'publicToken'     => '',
        'sessionHeader'   => '',
        'widgetEnabled'   => (bool) $widget_enabled,
    ];
}

/** === FAQs (public) === */
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
