<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// 1) Menu & submenus
add_action( 'admin_menu', function() {
    $parent = 'quiz_assist';
    add_menu_page( 'Quiz Assist', 'Quiz Assist', 'manage_options', $parent, 'qa_render_settings_page', 'dashicons-format-chat', 80 );
    add_submenu_page( $parent, 'Settings', 'Settings', 'manage_options', $parent, 'qa_render_settings_page' );
    add_submenu_page( $parent, 'Chats', 'Chats', 'manage_options', 'quiz_assist_chats', 'qa_render_chats_page' );
});

// 2) Enqueue admin-chat.js on the Chats screen
add_action( 'admin_enqueue_scripts', function() {
    if ( isset( $_GET['page'] ) && $_GET['page'] === 'quiz_assist_chats' ) {
        wp_enqueue_script( 'qa-admin-chat-js',
            QA_URL . 'assets/js/admin-chat.js',
            [], filemtime( QA_DIR . 'assets/js/admin-chat.js' ), true
        );
        wp_localize_script( 'qa-admin-chat-js', 'QA_ADMIN_CHAT', [
            'apiBase'      => rest_url( 'quiz-assist/v1' ),
            'sessionId'    => intval( $_GET['session_id'] ?? 0 ),
            'pollInterval' => 1000,
        ] );
    }
} );

// 3) Settings page
function qa_render_settings_page() {
    ?>
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
    <?php
}

// 4) Chats page
function qa_render_chats_page() {
    global $wpdb;
    $sess_table = $wpdb->prefix . 'qa_chat_sessions';
    $msg_table  = $wpdb->prefix . 'qa_chat_messages';
    $session_id = intval( $_GET['session_id'] ?? 0 );

    echo '<div class="wrap"><h1>Quiz Assist Chats</h1>';

    if ( $session_id ) {
        // Mark visitor messages read
        $wpdb->update( $msg_table, [ 'is_read' => 1 ], [
            'session_id' => $session_id,
            'sender'     => 'user',
            'is_read'    => 0
        ], [ '%d' ], [ '%d','%s','%d' ] );

        // Show messages
        echo '<div id="qa-chat-messages" style="border:1px solid #ddd;padding:12px;max-height:400px;overflow-y:auto;">';
        $messages = $wpdb->get_results( $wpdb->prepare(
            "SELECT sender, message, created_at
             FROM {$msg_table}
             WHERE session_id=%d
             ORDER BY created_at ASC",
            $session_id
        ) );
        foreach ( $messages as $m ) {
            $who   = $m->sender === 'user' ? 'Visitor' : 'Admin';
            $color = $m->sender === 'user' ? '#000'     : '#0052cc';
            printf(
                '<p><strong style="color:%1$s">%2$s:</strong> %3$s</p>',
                esc_attr( $color ),
                esc_html( $who ),
                esc_html( $m->message )
            );
        }
        echo '</div>';

        // Reply form
        ?>
        <form method="post" action="<?php echo admin_url( 'admin-post.php' ); ?>" style="margin-top:12px;">
          <input type="hidden" name="action"     value="qa_send_admin_message">
          <input type="hidden" name="session_id" value="<?php echo esc_attr( $session_id ); ?>">
          <textarea name="admin_message" rows="3" style="width:100%;margin-bottom:8px;" placeholder="Type your reply…" required></textarea>
          <?php submit_button( 'Send Reply' ); ?>
        </form>
        <?php

    } else {
        // List recent sessions
        $sessions = $wpdb->get_results( "
            SELECT s.id,
                   MAX(m.created_at) AS last_time,
                   SUM( CASE WHEN m.sender='user' AND m.is_read=0 THEN 1 ELSE 0 END ) AS unread
            FROM {$sess_table} s
            JOIN {$msg_table}    m ON m.session_id = s.id
            GROUP BY s.id
            ORDER BY last_time DESC
            LIMIT 50
        " );

        echo '<style>.unread-badge{background:#d63333;color:#fff;padding:2px 6px;border-radius:12px;font-size:12px;vertical-align:middle;}</style>';
        echo '<table class="widefat"><thead><tr><th>Session</th><th>Last Msg</th><th>Action</th></tr></thead><tbody>';
        foreach ( $sessions as $s ) {
            printf(
                '<tr>
                    <td>%1$d%2$s</td>
                    <td>%3$s</td>
                    <td><a href="%4$s">View Chat</a></td>
                 </tr>',
                esc_html( $s->id ),
                $s->unread ? ' <span class="unread-badge">'.esc_html($s->unread).'</span>' : '',
                esc_html( $s->last_time ),
                esc_url( admin_url( "admin.php?page=quiz_assist_chats&session_id={$s->id}" ) )
            );
        }
        echo '</tbody></table>';
    }

    echo '</div>';
}

// 5) Handle admin replies
add_action( 'admin_post_qa_send_admin_message', function() {
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
} );
