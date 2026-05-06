<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Security helpers: guest public-token (anti-CSRF), session tokens, rate limiting.
 */

define( 'QA_PUBLIC_HEADER',  'X-QA-Public' );
define( 'QA_SESSION_HEADER', 'X-QA-Token' );

/**
 * Issue a public token tied to this browser (guest or user).
 * Stored as a transient so the server can verify later.
 */
function qa_issue_public_token(): string {
    $t = bin2hex( random_bytes( 16 ) );
    set_transient( 'qa_pub_' . $t, 1, 12 * HOUR_IN_SECONDS );
    return $t;
}

/** Verify the public token from request headers (for guests). */
function qa_verify_public_token( WP_REST_Request $req ): bool {
    $hdr = $req->get_header( QA_PUBLIC_HEADER );
    if ( ! $hdr ) return false;
    return (bool) get_transient( 'qa_pub_' . $hdr );
}

/**
 * Per-bucket rate limiter. Windowed counter via transients.
 * Returns true if allowed, false if over limit.
 */
function qa_rate_allow( string $bucket, int $limit, int $window ): bool {
    $key   = 'qa_rl_' . md5( $bucket );
    $count = (int) get_transient( $key );
    if ( $count >= $limit ) return false;
    set_transient( $key, $count + 1, $window );
    return true;
}

/**
 * Session token helpers — avoid DB migrations by using transients.
 * We bind a random token to a session_id for 7 days.
 */
function qa_session_token_issue( int $session_id ): string {
    $tok = bin2hex( random_bytes( 16 ) );
    set_transient( 'qa_sess_' . $session_id, $tok, 7 * DAY_IN_SECONDS );
    return $tok;
}
function qa_session_token_get( int $session_id ): ?string {
    $v = get_transient( 'qa_sess_' . $session_id );
    return $v ? (string) $v : null;
}

/**
 * Permission for public POST/GET:
 * - If logged in: allow with regular REST nonce (WordPress handles it).
 * - If guest: require valid public token header.
 */
function qa_rest_can_public( WP_REST_Request $req ): bool {
    if ( is_user_logged_in() ) return true;
    return qa_verify_public_token( $req );
}

/**
 * Permission for accessing a specific chat session:
 * - Admins can always access.
 * - If session belongs to a logged-in user, the same user can access.
 * - If it’s a guest session, require the correct session token header.
 */
function qa_can_access_session( WP_REST_Request $req, stdClass $session_row ): bool {
    if ( current_user_can( 'manage_options' ) ) return true;

    $uid = (int) ( $session_row->user_id ?? 0 );
    if ( $uid > 0 ) {
        return get_current_user_id() === $uid;
    }

    $hdr = $req->get_header( QA_SESSION_HEADER );
    if ( ! $hdr ) return false;
    $tok = qa_session_token_get( (int) $session_row->id );
    return $tok && hash_equals( $tok, $hdr );
}
