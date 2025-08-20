<?php
/**
 * Email notifications when a GUEST sends a new chat message.
 * Sends to the WordPress admin email (filterable). Logs success/failure.
 */
if (defined('WP_DEBUG_LOG') && WP_DEBUG_LOG) error_log('[quiz-assist notify] notifications.php loaded');

if ( ! defined( 'ABSPATH' ) ) exit;

/** Lightweight logger to wp-content/debug.log when WP_DEBUG_LOG = true */
function qa_notify_log( $msg ) {
    if ( defined('WP_DEBUG_LOG') && WP_DEBUG_LOG ) {
        error_log( '[quiz-assist notify] ' . ( is_string($msg) ? $msg : print_r($msg, true) ) );
    }
}

/** Capture PHPMailer-level failures for diagnostics */
add_action( 'wp_mail_failed', function( $wp_error ) {
    qa_notify_log( 'wp_mail_failed: ' . $wp_error->get_error_message() );
    $data = $wp_error->get_error_data();
    if ( $data ) qa_notify_log( $data );
}, 10, 1 );

/**
 * After REST callback completes, look for successful POSTs to /quiz-assist/v1/chat/send.
 * If the session belongs to a guest (user_id = 0), email the admin.
 */
add_filter( 'rest_request_after_callbacks', function( $response, $handler, $request ) {
    try {
        if ( ! ( $request instanceof WP_REST_Request ) ) return $response;
        if ( strtoupper( $request->get_method() ) !== 'POST' ) return $response;
        if ( $request->get_route() !== '/quiz-assist/v1/chat/send' ) return $response;

        // Only proceed on success (2xx)
        if ( is_wp_error( $response ) ) return $response;
        $status = method_exists( $response, 'get_status' ) ? (int) $response->get_status() : 200;
        if ( $status < 200 || $status >= 300 ) return $response;

        $p          = (array) $request->get_json_params();
        $session_id = intval( $p['session_id'] ?? 0 );
        $message    = trim( (string) ( $p['message'] ?? '' ) );
        if ( ! $session_id || $message === '' ) return $response;

        global $wpdb;
        $sess_tbl = $wpdb->prefix . 'qa_chat_sessions';
        $row = $wpdb->get_row( $wpdb->prepare(
            "SELECT id, user_id, guest_name, guest_email, guest_phone
             FROM {$sess_tbl}
             WHERE id=%d LIMIT 1",
            $session_id
        ) );
        if ( ! $row ) { qa_notify_log("No session found for #{$session_id}"); return $response; }
        if ( intval( $row->user_id ) > 0 ) { /* only guests */ return $response; }

        // Throttle duplicates (e.g., retries)
        $hash = md5( 'qa_guest_msg|' . $session_id . '|' . $message );
        if ( get_transient( $hash ) ) { qa_notify_log('Duplicate message within 60s; skipping email'); return $response; }
        set_transient( $hash, 1, MINUTE_IN_SECONDS );

        // Recipient (filterable)
        $to = apply_filters( 'qa_notify_recipient', get_option( 'admin_email' ) );
        if ( ! $to || ! is_email( $to ) ) { qa_notify_log('Invalid recipient: ' . print_r($to, true)); return $response; }

        $guest_name  = $row->guest_name  ?: 'Guest';
        $guest_email = $row->guest_email ?: '';
        $guest_phone = $row->guest_phone ?: '';

        $subject = sprintf( 'New guest message from %s%s',
            $guest_name,
            $guest_email ? " <{$guest_email}>" : ''
        );

        $view_url = admin_url( 'admin.php?page=quiz_assist_chats&session_id=' . $session_id );

        $body_lines = [
            'You have a new message from a guest.',
            '',
            'Name:  ' . $guest_name,
            'Email: ' . ( $guest_email ?: '—' ),
            'Phone: ' . ( $guest_phone ?: '—' ),
            'Session: #' . $session_id,
            'Time: ' . current_time( 'mysql' ),
            '',
            'Message:',
            $message,
            '',
            'View conversation: ' . $view_url,
        ];
        $body = implode( "\n", $body_lines );

        $headers = [ 'Content-Type: text/plain; charset=UTF-8' ];

        qa_notify_log([ 'about_to_send' => true, 'to' => $to, 'subject' => $subject ]);
        $sent = wp_mail( $to, $subject, $body, $headers );
        qa_notify_log( $sent ? 'wp_mail returned TRUE' : 'wp_mail returned FALSE' );

    } catch ( \Throwable $e ) {
        qa_notify_log( 'Exception: ' . $e->getMessage() );
    }

    return $response;
}, 10, 3 );
