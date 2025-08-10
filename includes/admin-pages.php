<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * 1) Admin menu
 */
add_action( 'admin_menu', function() {
    $parent = 'quiz_assist';

    add_menu_page(
        'Quiz Assist',
        'Quiz Assist',
        'manage_options',
        $parent,
        'qa_render_settings_page',
        'dashicons-format-chat',
        80
    );

    add_submenu_page(
        $parent,
        'Settings',
        'Settings',
        'manage_options',
        $parent,
        'qa_render_settings_page'
    );

    add_submenu_page(
        $parent,
        'Chats',
        'Chats',
        'manage_options',
        'quiz_assist_chats',
        'qa_render_chats_page'
    );
});

/**
 * 2) Enqueue admin assets
 */
add_action( 'admin_enqueue_scripts', function() {
    $page = isset($_GET['page']) ? sanitize_text_field($_GET['page']) : '';

    // Settings page CSS
    if ( $page === 'quiz_assist' ) {
        if ( file_exists( QA_DIR . 'assets/css/admin.css' ) ) {
            wp_enqueue_style(
                'qa-admin-css',
                QA_URL . 'assets/css/admin.css',
                [],
                filemtime( QA_DIR . 'assets/css/admin.css' )
            );
        }
        return;
    }

    // Chats page assets
    if ( $page === 'quiz_assist_chats' ) {
        if ( file_exists( QA_DIR . 'assets/js/admin-chat.js' ) ) {
            wp_enqueue_script(
                'qa-admin-chat-js',
                QA_URL . 'assets/js/admin-chat.js',
                [],
                filemtime( QA_DIR . 'assets/js/admin-chat.js' ),
                true
            );
            wp_localize_script( 'qa-admin-chat-js', 'QA_ADMIN_CHAT', [
                'apiBase'        => rest_url('quiz-assist/v1'),
                'sessionId'      => intval( $_GET['session_id'] ?? 0 ),
                'pollInterval'   => 1200,
                'restNonce'      => wp_create_nonce( 'wp_rest' ),
                'adminPostBase'  => admin_url('admin-post.php'),
                'deleteAction'   => 'qa_delete_chat_session',
                'deleteNonce'    => wp_create_nonce( 'qa_delete_chat_any' ),
            ] );
        }

        $inline = '
          .qa-unread-badge{background:#d63333;color:#fff;padding:2px 6px;border-radius:12px;font-size:11px;vertical-align:middle;margin-left:6px}
          .qa-chats-table .col-actions{width:220px;text-align:right}
          .qa-btn-delete.button{background:#dc2626;border-color:#dc2626;color:#fff}
          .qa-btn-delete.button:hover{background:#b91c1c;border-color:#b91c1c;color:#fff}
          .qa-user-meta{color:#334155;font-size:12px;margin-top:2px}
          .qa-user-meta span{display:inline-block;margin-right:10px}
        ';
        wp_register_style( 'qa-admin-chats-base', false );
        wp_enqueue_style( 'qa-admin-chats-base' );
        wp_add_inline_style( 'qa-admin-chats-base', $inline );
    }
});

/**
 * 3) Settings page shell
 */
function qa_render_settings_page() { ?>
  <div class="wrap">
    <h1>Quiz Assist Settings</h1>
    <form method="post" action="options.php">
      <?php
        settings_fields( 'quizAssist' );
        do_settings_sections( 'quizAssist' );
        submit_button();
      ?>
    </form>
  </div>
<?php }

/**
 * 4) Chats page
 */
function qa_render_chats_page() {
    global $wpdb;
    $sess_table = $wpdb->prefix . 'qa_chat_sessions';
    $msg_table  = $wpdb->prefix . 'qa_chat_messages';
    $session_id = intval( $_GET['session_id'] ?? 0 );

    echo '<div class="wrap"><h1>Quiz Assist Chats</h1>';

    if ( $session_id ) {
        // Session meta
        $session = $wpdb->get_row( $wpdb->prepare(
            "SELECT user_id, guest_name, guest_email, guest_phone, created_at
             FROM {$sess_table}
             WHERE id=%d",
            $session_id
        ) );

        if ( $session ) {
            if ( $session->user_id ) {
                $user = get_userdata( $session->user_id );
                echo '<p><strong>User:</strong> ' . esc_html( $user->user_login )
                   . ' <span class="qa-user-meta"><span>Email: '
                   . esc_html( $user->user_email ) . '</span></span></p>';
            } else {
                echo '<p><strong>Guest:</strong> ' . esc_html( $session->guest_name )
                   . ' <span class="qa-user-meta"><span>Email: '
                   . esc_html( $session->guest_email ) . '</span>'
                   . '<span>Phone: ' . esc_html( $session->guest_phone ) . '</span></span></p>';
            }
        } else {
            echo '<p><em>Session not found.</em></p>';
        }

        // Mark unread visitor messages as read
        $wpdb->update(
            $msg_table,
            [ 'is_read' => 1 ],
            [ 'session_id' => $session_id, 'sender' => 'user', 'is_read' => 0 ],
            [ '%d' ],
            [ '%d','%s','%d' ]
        );

        // Messages container (JS populates)
        echo '<div id="qa-chat-messages" style="border:1px solid #ddd;padding:12px;max-height:420px;overflow-y:auto;"></div>';

        // Reply form
        ?>
        <form method="post" action="<?php echo esc_url( admin_url('admin-post.php') ); ?>" style="margin-top:12px;">
          <input type="hidden" name="action" value="qa_send_admin_message">
          <input type="hidden" name="session_id" value="<?php echo esc_attr( $session_id ); ?>">
          <textarea name="admin_message" rows="3" style="width:100%;margin-bottom:8px;" placeholder="Type reply…" required></textarea>
          <?php submit_button( 'Send Reply' ); ?>
        </form>
        <?php

    } else {
        // List table (JS fills rows)
        echo '<table id="qa-chat-sessions-table" class="widefat striped qa-chats-table">
                <thead>
                  <tr>
                    <th style="width:120px;">Session</th>
                    <th>Details</th>
                    <th style="width:220px;">Last Message</th>
                    <th class="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td colspan="4">Loading…</td></tr>
                </tbody>
              </table>';
    }

    echo '</div>';
}

/**
 * 5) Admin: send reply
 */
add_action( 'admin_post_qa_send_admin_message', function(){
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized', '', [ 'response' => 403 ] );
    }
    global $wpdb;
    $session_id = intval( $_POST['session_id'] ?? 0 );
    $msg        = sanitize_text_field( $_POST['admin_message'] ?? '' );
    if ( $session_id && $msg ) {
        $wpdb->insert(
            $wpdb->prefix . 'qa_chat_messages',
            [
                'session_id' => $session_id,
                'sender'     => 'admin',
                'message'    => $msg,
                'created_at' => current_time( 'mysql' ),
                'is_read'    => 1
            ],
            [ '%d','%s','%s','%s','%d' ]
        );
    }
    wp_safe_redirect( admin_url( "admin.php?page=quiz_assist_chats&session_id={$session_id}" ) );
    exit;
});

/**
 * 6) Admin: delete session (messages then session)
 */
add_action( 'admin_post_qa_delete_chat_session', function(){
    if ( ! current_user_can('manage_options' ) ) {
        wp_die( 'Unauthorized', '', [ 'response' => 403 ] );
    }
    check_admin_referer( 'qa_delete_chat_any' );

    $sid = intval( $_GET['session_id'] ?? 0 );
    global $wpdb;
    if ( $sid ) {
        $wpdb->delete( $wpdb->prefix.'qa_chat_messages', [ 'session_id' => $sid ], [ '%d' ] );
        $wpdb->delete( $wpdb->prefix.'qa_chat_sessions', [ 'id' => $sid ], [ '%d' ] );
    }

    wp_safe_redirect( admin_url( 'admin.php?page=quiz_assist_chats' ) );
    exit;
});
