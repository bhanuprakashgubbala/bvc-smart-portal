# app.py - kept so that "python app.py" still works.
# The real backend lives in server.py (it has every feature: login, registration,
# leave, library, bus tracking, timetable, AI chat ...). This file simply starts it.
from server import app

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
