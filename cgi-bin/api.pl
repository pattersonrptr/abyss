#!C:/Strawberry/perl/bin/perl.exe
# ============================================================
#  LOOKING INTO THE ABYSS :: api.pl  (v2 -- fixed-size binary records)
#  CGI backend - Perl 5
#  Format: pack/unpack + seek by ID (like fread/fwrite/fseek in C)
#
#  struct Question { uint32 id; uint32 ts;            char text[1004]; };          // 1012 bytes
#  struct Answer   { uint32 id; uint32 q_id; uint32 ts; char text[1004]; };        // 1016 bytes
# ============================================================
use strict;
use warnings;
use CGI;
use Fcntl qw(:flock SEEK_SET SEEK_END);
use FindBin qw($Bin);

# --- record layout ---
# text field stores base64(XOR(text, nonce)) -- nonce prevents keystream reuse
my $FMT_Q = 'V V a1004';    # id(4) + timestamp/nonce(4) + ciphertext(1004) = 1012
my $SZ_Q  = 1012;
my $FMT_A = 'V V V a1004';  # id(4) + q_id(4) + timestamp/nonce(4) + ciphertext(1004) = 1016
my $SZ_A  = 1016;

my $DIR    = "$Bin/../data";
my $FILE_Q = "$DIR/questions.bin";
my $FILE_A = "$DIR/answers.bin";

my $cgi    = new CGI;
my $action = $cgi->param('action') || 'list';

print "Content-Type: application/json; charset=utf-8\n";
print "Access-Control-Allow-Origin: *\n";
print "\n";

if    ($action eq 'list')     { action_list();     }
elsif ($action eq 'view')     { action_view();     }
elsif ($action eq 'question') { action_question(); }
elsif ($action eq 'answer')   { action_answer();   }
else  { print '{"error":"unknown action"}'; }

exit 0;

# ============================================================

sub action_list {
    my @questions;
    if (open(my $fh, '<:raw', $FILE_Q)) {
        flock($fh, LOCK_SH);
        while (1) {
            my $buf;
            my $n = read($fh, $buf, $SZ_Q);
            last unless defined $n && $n == $SZ_Q;
            my ($id, $ts, $text) = unpack($FMT_Q, $buf);
            $text =~ s/\x00+$//;
            push @questions, { id => $id, ts => $ts, text => $text };
        }
        flock($fh, LOCK_UN);
        close($fh);
    }

    my %cnt;
    if (open(my $fa, '<:raw', $FILE_A)) {
        flock($fa, LOCK_SH);
        while (1) {
            my $buf;
            my $n = read($fa, $buf, $SZ_A);
            last unless defined $n && $n == $SZ_A;
            my (undef, $q_id) = unpack($FMT_A, $buf);
            $cnt{$q_id}++;
        }
        flock($fa, LOCK_UN);
        close($fa);
    }

    my @json;
    for my $q (reverse @questions) {
        push @json, sprintf('{"id":%d,"text":%s,"ts":%d,"num_answers":%d}',
            $q->{id}, json_str($q->{text}), $q->{ts}, $cnt{$q->{id}} // 0);
    }
    print '[' . join(',', @json) . ']';
}

sub action_view {
    my $id = int($cgi->param('id') || 0);
    unless ($id > 0) { print '{"error":"invalid id"}'; return; }

    # direct seek -- like fseek(fh, (id-1)*sizeof, SEEK_SET) in C
    open(my $fh, '<:raw', $FILE_Q) or do { print '{"error":"file not found"}'; return; };
    flock($fh, LOCK_SH);
    seek($fh, ($id - 1) * $SZ_Q, SEEK_SET);
    my $buf;
    my $n = read($fh, $buf, $SZ_Q);
    flock($fh, LOCK_UN);
    close($fh);

    unless (($n // 0) == $SZ_Q) { print '{"error":"not found"}'; return; }
    my ($qid, $ts, $text) = unpack($FMT_Q, $buf);
    $text =~ s/\x00+$//;
    unless ($qid == $id) { print '{"error":"not found"}'; return; }

    # answers: linear scan (multiple records per question, no direct seek)
    my @ans_json;
    if (open(my $fa, '<:raw', $FILE_A)) {
        flock($fa, LOCK_SH);
        while (1) {
            my $abuf;
            my $an = read($fa, $abuf, $SZ_A);
            last unless defined $an && $an == $SZ_A;
            my ($aid, $aq_id, $ats, $atext) = unpack($FMT_A, $abuf);
            if ($aq_id == $id) {
                $atext =~ s/\x00+$//;
                push @ans_json, sprintf('{"text":%s,"ts":%d}',
                    json_str($atext), $ats);
            }
        }
        flock($fa, LOCK_UN);
        close($fa);
    }

    printf('{"id":%d,"text":%s,"ts":%d,"answers":[%s]}',
        $qid, json_str($text), $ts, join(',', @ans_json));
}

sub action_question {
    my $b64 = sanitize_b64($cgi->param('text') // '');
    my $ts  = int($cgi->param('ts') || time());
    if (length($b64) == 0 )  { print '{"error":"empty question"}';    return; }
    if (length($b64) > 1003) { print '{"error":"question too long"}'; return; }

    my $fh;
    open($fh, '+<:raw', $FILE_Q) or open($fh, '>:raw', $FILE_Q)
        or do { print '{"error":"write error"}'; return; };
    flock($fh, LOCK_EX);
    seek($fh, 0, SEEK_END);
    my $new_id = int(tell($fh) / $SZ_Q) + 1;
    print $fh pack($FMT_Q, $new_id, $ts, $b64);
    flock($fh, LOCK_UN);
    close($fh);

    printf('{"ok":1,"id":%d}', $new_id);
}

sub action_answer {
    my $q_id = int($cgi->param('id')   // 0);
    my $b64  = sanitize_b64($cgi->param('text') // '');
    my $ts   = int($cgi->param('ts') || time());
    unless ($q_id > 0)       { print '{"error":"invalid id"}';     return; }
    if (length($b64) == 0)   { print '{"error":"empty answer"}';   return; }
    if (length($b64) > 1003) { print '{"error":"answer too long"}'; return; }

    my $fa;
    open($fa, '+<:raw', $FILE_A) or open($fa, '>:raw', $FILE_A)
        or do { print '{"error":"write error"}'; return; };
    flock($fa, LOCK_EX);
    seek($fa, 0, SEEK_END);
    my $new_id = int(tell($fa) / $SZ_A) + 1;
    print $fa pack($FMT_A, $new_id, $q_id, $ts, $b64);
    flock($fa, LOCK_UN);
    close($fa);

    printf('{"ok":1,"id":%d}', $new_id);
}

# ============================================================

# accepts only valid base64 characters (text arrives encrypted from client)
sub sanitize_b64 {
    my ($s) = @_;
    $s =~ s/[^A-Za-z0-9+\/=]//g;
    return $s;
}

sub sanitize {
    my ($s) = @_;
    $s =~ s/[\x00-\x1f\x7f]/ /g;
    $s =~ s/^\s+|\s+$//g;
    return $s;
}

sub json_str {
    my ($s) = @_;
    $s //= '';
    $s =~ s/\\/\\\\/g;
    $s =~ s/"/\\"/g;
    $s =~ s/\n/\\n/g;
    $s =~ s/\r/\\r/g;
    $s =~ s/\t/\\t/g;
    return '"' . $s . '"';
}
