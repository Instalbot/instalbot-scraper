from datetime import datetime
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.dialects.postgresql import JSON, NUMRANGE
from sqlalchemy import Integer, DateTime, String, Column, Boolean, ForeignKey

Base = declarative_base()


class User(Base):
    __tablename__ = 'users'

    userid = Column(Integer, primary_key=True, autoincrement=True)
    created = Column(DateTime(timezone=True), default=datetime.now)
    updated = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)
    username = Column(String(255), nullable=False)
    password = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)

    # Define the relationship with the Flags table
    flags = relationship('Flag', backref='user', cascade='all, delete-orphan', single_parent=True)

    # Define the relationship with the Words table
    words = relationship('Word', backref='user', cascade='all, delete-orphan', single_parent=True)

    def __repr__(self):
        return '<User %r>' % self.email

    def to_dict(self):
        return {
            'userid': self.userid,
            'username': self.username,
            'email': self.email,
            'flags': self.flags.to_dict(),
            'words': self.words.to_dict()
        }


class Flag(Base):
    __tablename__ = 'flags'

    userid = Column(Integer, ForeignKey('users.userid', ondelete='CASCADE'), primary_key=True)
    todo = Column(Boolean, default=False)
    hoursrange = Column(NUMRANGE, default='[14, 22]')
    instaling_user = Column(String(255), default='', nullable=False)
    instaling_pass = Column(String(255), default='', nullable=False)
    error_level = Column(Integer, default=5, nullable=False)

    def __repr__(self):
        return '<Flag %r>' % self.userid

    def to_dict(self):
        return {
            'userid': self.userid,
            'todo': self.todo,
            'hoursrange': self.hoursrange,
            'instaling_user': self.instaling_user,
            'instaling_pass': '',
            'error_level': self.error_level
        }


class Word(Base):
    __tablename__ = 'words'

    userid = Column(Integer, ForeignKey('users.userid', ondelete='CASCADE'), primary_key=True)
    list = Column(JSON, nullable=False, default=[])
    active = Column(Boolean, nullable=False, default=False)

    def __repr__(self):
        return '<Word %r>' % self.userid

    def to_dict(self):
        return {
            'userid': self.userid,
            'list': self.list,
            'active': self.active
        }

